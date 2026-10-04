# Recommendations

How Ella picks the videos in the home page spotlight and the "For you" shelf.
Status: design, not yet implemented. The spotlight currently shuffles the 40
most played videos once a day (`loadHome` in `lib/videoCards.ts`).

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

The player reports once on pause, on end and on page hide
(`navigator.sendBeacon`). One user produces a few dozen rows a day.

Each watch becomes an engagement value `e` in [-0.3, 1]:

```
e = min(1, watched_sec / min(duration * 0.6, 600))  // 60% or 10 min = 1
e = -0.3                                           // left within 20 s
```

## 2. Taste profile

Tag affinity, with a 30 day half-life:

```
affinity(t) = Σ e * 0.5^(age_days / 30)    over watches of videos tagged t
idf(t)      = log(N / videos_with_t)       // common tags say little
```

A child tag adds half its affinity to its parent (existing hierarchy).
Series affinity uses the same sum over the series' videos.

## 3. Score each candidate

```
score(v) = novelty(v) * ( 0.50 * relevance
                        + 0.20 * freshness
                        + 0.20 * series_next
                        + 0.10 * quality )
```

| Term        | Definition                                                                                                  |
| ----------- | ----------------------------------------------------------------------------------------------------------- |
| relevance   | Σ over v's tags of affinity·idf, divided by √(tag count), scaled to 0..1.                                   |
| freshness   | exp(-days_since_added / 14).                                                                                |
| series_next | The next unwatched episode of a watched series, scaled by series affinity.                                  |
| quality     | Thumbnail present, at least 720p, at least 3 minutes.                                                       |
| novelty     | Unwatched 1. In progress 0 (it is in "Continue watching"). Finished within 60 days 0. Finished earlier 0.3. |

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

## 5. Cold start

```
α     = min(1, meaningful_watches / 20)
final = α * personal_score + (1 - α) * (freshness + quality + random)
```

## 6. When it is computed

- Now (about 900 videos, hundreds of watches): on request, under 10 ms.
  Cached in memory; a new watch event or a library change clears the cache.
  The random parts use the date as seed, so the spotlight holds for a day.
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
- `videos.views` stays as the displayed play count. It no longer ranks.

## Implementation order

1. `watch_events` table and player reporting.
2. Taste profile and scoring, with tests on a scratch database.
3. Spotlight replaced, "For you" shelf added.
