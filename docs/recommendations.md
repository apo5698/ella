# Recommendations

How Ella picks the videos in the home page spotlight and the "For you" shelf.
The code is `lib/recommend.ts`; the player reports through
`app/video/[id]/useWatchReport.ts` to `POST /api/videos/[id]/watch`.

Not yet built: the "Not interested" action (the `dismiss` source and its
score are in place) and the related list reusing the score.

## Why the current pick is weak

The database holds only lifetime counters without time: `videos.views` (a
play started), `videos.clicks` (the page opened) and `tags.clicks` (a tag
filter chosen). A play of five seconds counts the same as a full watch, and
nothing records when it happened. In a library where few videos have been
played, "most played" is close to random.

## 1. Data: one row per watch

New table `watch_events`:

| Column         | Meaning                                          |
| -------------- | ------------------------------------------------ |
| `video_id`     | The video.                                       |
| `started_at`   | Epoch ms.                                        |
| `watched_sec`  | Seconds actually played. Skipped parts excluded. |
| `max_position` | Furthest point reached, in seconds.              |
| `duration`     | Video length, in seconds.                        |
| `source`       | `click`, `autoplay` or `resume`.                 |

The player reports on pause, on end, when the page is hidden and when it
leaves the video (`navigator.sendBeacon`). Each report carries running totals
and a `session` key chosen by the page, so one sitting stays one row however
many reports it sends. One user produces a few dozen rows a day.

Each watch becomes an engagement value `e` in [-0.3, 1]:

```
e = min(1, watched_sec / min(duration * 0.6, 600))  // 60% or 10 min = 1
e = -0.3                                           // left within 20 s
```

Leaving early counts as 0 instead of -0.3 after autoplay, which the viewer
did not choose. On a video shorter than a minute, "early" is the first 30%.
A watch with `e >= 0.5` is a meaningful watch.

## 2. Taste profile

Tag affinity, with a 30 day half-life:

```
affinity(t) = Σ e * 0.5^(age_days / 30)    over watches of videos tagged t
idf(t)      = log(N / videos_with_t)       // common tags say little
```

A child tag adds half its affinity to its parent, a quarter to the
grandparent, and so on (existing hierarchy). A video's tags are expanded the
same way before scoring, so two videos with sibling tags share their parent.
Series affinity uses the same sum over the series' videos.

## 3. Score each candidate

```
score(v) = novelty(v) * ( 0.50 * relevance
                        + 0.20 * freshness
                        + 0.20 * series_next
                        + 0.10 * quality )
```

| Term        | Definition                                                                                                                                                                  |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| relevance   | Σ over v's tags of affinity·idf, divided by √(tag count), scaled to -1..1 on one scale for likes and dislikes.                                                              |
| freshness   | exp(-days_since_added / 14).                                                                                                                                                |
| series_next | The next unwatched episode of a watched series, scaled by series affinity.                                                                                                  |
| quality     | Thumbnail present, at least 720p, at least 3 minutes.                                                                                                                       |
| novelty     | Unwatched 1. In progress 0 (it is in "Continue watching"). Finished within 60 days 0. Finished earlier 0.3. Left early, or left partway over 30 days ago, 0.3. Dismissed 0. |

## 4. Pick five: relevant and varied

Maximal marginal relevance, λ = 0.7:

```
next = argmax  λ * score(v) - (1 - λ) * max(similarity(v, s) for s in picked)
similarity = Jaccard of the two tag sets
```

Rules on top:

- At most one video per series.
- One slot for the best video added in the last 7 days.
- One exploration slot: a random video from tags with low affinity that the
  viewer has not shown dislike for. It keeps the picks from narrowing.

"Finished" matches `lib/watchProgress.ts`: within the last 3% or 20 seconds.
A score of zero or below drops the video from the ranking, so tags the viewer
clearly dislikes stop appearing.

## 5. Cold start

```
α     = min(1, meaningful_watches / 20)
final = novelty * (α * personal_score + (1 - α) * (freshness + quality + random) / 3)
```

The "For you" shelf appears after 3 meaningful watches. Below that it would
only repeat the spotlight's chance.

## 6. When it is computed

- Now (about 900 videos, hundreds of watches): on request, about 15 ms.
  Cached in memory under a key of row counts and sums over `watch_events`,
  `videos` and `video_tags`, so a new report or a library change recomputes
  it and a repeat visit costs under 1 ms. The random parts use the date as
  seed, so the spotlight holds for a day.
- Later (tens of thousands): a `tag_affinity` table updated per watch with a
  decayed counter, so nothing recomputes in full and no scheduled job runs:

```
stored: (score, updated_at)
on a watch: score = score * 0.5^((now - updated_at) / 30 days) + e
on read:    decay the same way to now
```

## 7. Related changes

- The "For you" shelf and the related list on the video page reuse the score.
- A "Not interested" action on the video page records e = -1.
- `videos.views` stays as the displayed play count. It no longer ranks. A
  sitting adds one view once it has played past the bounce line,
  min(20 s, 30% of the length), skipped parts excluded. The server decides
  this from the watch report (`lib/watchEvents.ts`), and the same line
  separates a bounce from a watch above (`lib/watchRules.ts`).
- Watch reports also carry the seconds played in each of 100 buckets, the
  input to the watch heat curve. See `lib/heat.ts`, which also holds the scene
  curve measured from ffmpeg scene scores (`lib/sceneHeat.ts`) and picks where
  card previews play.

## Implementation order

1. `watch_events` table and player reporting. Done.
2. Taste profile and scoring, with tests on a scratch database. Done
   (`tests/recommend.test.ts`).
3. Spotlight replaced, "For you" shelf added. Done.
4. "Not interested" on the video page, and the related list on the score.
