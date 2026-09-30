"use client";

import { useTranslations } from "next-intl";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import type { MediaPlayerInstance } from "@vidstack/react";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  CircleCheckIcon,
  CircleXIcon,
  EllipsisVerticalIcon,
  ImageIcon,
  PlayIcon,
  SparklesIcon,
  Trash2Icon,
  Undo2Icon,
} from "lucide-react";
import { toast } from "sonner";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import HelpTip from "@/components/HelpTip";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupTextarea,
} from "@/components/ui/input-group";
import { Spinner } from "@/components/ui/spinner";
import { useTaskQueue } from "@/hooks/useTaskQueue";
import { formatDuration } from "@/lib/format";
import type { VideoTagState } from "@/lib/types";
import { videoEditorHref } from "@/lib/videoListContext";
import type { VideoNeighbours } from "@/lib/videoQuery";
import type { PathCheck } from "@/app/api/videos/path-check/route";
import VideoPlayer from "@/app/video/[id]/VideoPlayer";
import VideoDeleteDialog from "../VideoDeleteDialog";
import TagEditor, { TAG_INPUT_ID } from "./TagEditor";

/** How long the path field rests before the server is asked about it. */
const PATH_DEBOUNCE_MS = 300;

type Draft = { title: string; path: string; tagState: VideoTagState };

/** The name a video takes when the name field is left empty. */
function fileBaseName(fullPath: string): string {
  const name = fullPath.split("/").pop() ?? "";
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(0, dot) : name;
}

/** Order-insensitive where order carries no meaning, so sorting is not a change. */
function sameTagState(a: VideoTagState, b: VideoTagState) {
  const tags = (state: VideoTagState) =>
    state.tags
      .map((tag) => `${tag.name}\u0000${tag.source}`)
      .sort()
      .join("\u0001");
  return (
    a.seriesName === b.seriesName &&
    tags(a) === tags(b) &&
    [...a.rejectedTags].sort().join("\u0001") ===
      [...b.rejectedTags].sort().join("\u0001")
  );
}

function sameDraft(a: Draft, b: Draft) {
  return (
    a.title === b.title &&
    a.path === b.path &&
    sameTagState(a.tagState, b.tagState)
  );
}

/**
 * Keeps the edits already made and adds what a recognition run found since,
 * so a run finishing mid-edit never discards what is being typed.
 */
function mergeRecognized(
  draft: VideoTagState,
  server: VideoTagState,
): VideoTagState {
  const known = new Set([
    ...draft.tags.map((tag) => tag.name),
    ...draft.rejectedTags,
  ]);
  return {
    ...draft,
    tags: [...draft.tags, ...server.tags.filter((tag) => !known.has(tag.name))],
  };
}

/** A position in the video; unlike a duration, the very start is a time too. */
function coverTime(sec: number) {
  return sec < 1 ? "0:00" : formatDuration(Math.round(sec));
}

/**
 * Names and paths are long, so they are edited in boxes that wrap, but
 * neither may hold a line break: Enter adds none and a pasted one is dropped.
 */
function singleLine(value: string) {
  return value.replace(/[\r\n]+/g, "");
}

function preventNewline(event: React.KeyboardEvent) {
  if (event.key === "Enter" && !event.nativeEvent.isComposing)
    event.preventDefault();
}

/** Whether a key press belongs to a text field rather than to the page. */
function isTyping(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable ||
      target.tagName === "INPUT" ||
      target.tagName === "TEXTAREA" ||
      target.tagName === "SELECT")
  );
}

/**
 * One video on one page: it plays on the left while its tags and details are
 * edited on the right, and the previous and next buttons walk the list it was
 * opened from, so a run of videos can be tagged without returning to it.
 */
export default function VideoWorkbench({
  video,
  initialThumbSec,
  initialPathExists,
  initialTagState,
  neighbours,
  views,
  playerMeta,
}: {
  video: {
    id: number;
    title: string;
    path: string;
    thumbnail: string | null;
    durationSec: number | null;
  };
  initialThumbSec: number;
  initialPathExists: boolean;
  initialTagState: VideoTagState;
  neighbours: VideoNeighbours;
  views: number;
  playerMeta: { duration: string; resolution: string | null; size: string };
}) {
  const t = useTranslations("VideoEdit");
  const actions = useTranslations("VideoActions");
  const common = useTranslations("Common");
  const router = useRouter();
  const searchParams = useSearchParams();
  const { jobs, notifications } = useTaskQueue();
  const player = useRef<MediaPlayerInstance>(null);
  const mountedAt = useRef(0);
  const syncedTask = useRef<number | null>(null);

  // What the server holds, and what is being edited. The page is dirty while
  // they differ, which is what the save button and the leave guard read.
  const [saved, setSaved] = useState<Draft>({
    title: video.title,
    path: video.path,
    tagState: initialTagState,
  });
  const [draft, setDraft] = useState<Draft>(saved);
  const [thumbnail, setThumbnail] = useState(video.thumbnail);
  const [thumbSec, setThumbSec] = useState(initialThumbSec);
  /** A frame chosen from playback and not yet saved as the cover. */
  const [coverSec, setCoverSec] = useState<number | null>(null);
  /** The last path the server was asked about, and its answer. */
  const [pathCheck, setPathCheck] = useState({
    path: video.path,
    exists: initialPathExists,
    error: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [leaving, setLeaving] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [recognizeRequested, setRecognizeRequested] = useState(false);
  const [navigating, startNavigation] = useTransition();

  const typedPath = draft.path.trim();
  const checkingPath = typedPath !== "" && pathCheck.path !== typedPath;
  const pathExists = !checkingPath && pathCheck.exists;
  const pathError = !typedPath
    ? t("pathRequired")
    : checkingPath
      ? ""
      : pathCheck.error;
  const dirty = !sameDraft(draft, saved) || coverSec !== null;
  const canSave = !saving && !pathError && typedPath !== "";
  const hrefFor = (id: number | null) =>
    id === null ? null : videoEditorHref(id, searchParams);
  const previousHref = hrefFor(neighbours.previous);
  const nextHref = hrefFor(neighbours.next);
  const recognizing =
    recognizeRequested ||
    jobs.some(
      (job) =>
        job.kind === "VIDEO_RETAG" &&
        Number(job.payload.videoId) === video.id &&
        (job.status === "queued" || job.status === "running"),
    );

  useEffect(() => {
    mountedAt.current = Date.now();
  }, []);

  // Closing the tab or reloading would drop the draft without a word.
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  // Whether a file sits at the typed path, and whether another video has it.
  useEffect(() => {
    if (!checkingPath) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      fetch(
        `/api/videos/path-check?path=${encodeURIComponent(typedPath)}&id=${video.id}`,
        { signal: controller.signal },
      )
        .then((res) => res.json() as Promise<PathCheck>)
        .then((check) =>
          setPathCheck({
            path: typedPath,
            exists: check.exists,
            error: check.taken
              ? t("pathTaken", { title: check.takenBy?.title ?? "" })
              : "",
          }),
        )
        .catch((cause) => {
          if ((cause as Error).name === "AbortError") return;
          // Offline or mid-restart. Saving still validates server side.
          setPathCheck({ path: typedPath, exists: false, error: "" });
        });
    }, PATH_DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [checkingPath, typedPath, t, video.id]);

  // A recognition run for this video finished: fold its tags into the draft.
  useEffect(() => {
    const completed = notifications.find(
      (notification) =>
        notification.type === "VIDEO_RETAG" &&
        notification.createdAt >= mountedAt.current &&
        notification.id !== syncedTask.current &&
        Number(notification.payload.videoId) === video.id,
    );
    if (!completed) return;
    syncedTask.current = completed.id;
    setRecognizeRequested(false);
    const controller = new AbortController();
    fetch(`/api/videos/${video.id}`, { signal: controller.signal })
      .then((res) => res.json() as Promise<{ tagState?: VideoTagState }>)
      .then(({ tagState }) => {
        if (!tagState) return;
        setDraft((current) => ({
          ...current,
          tagState: mergeRecognized(current.tagState, tagState),
        }));
        setSaved((current) => ({ ...current, tagState }));
      })
      .catch((cause) => {
        if ((cause as Error).name !== "AbortError")
          console.error("[video] Unable to load recognition results", cause);
      });
    return () => controller.abort();
  }, [notifications, video.id]);

  async function save(): Promise<boolean> {
    if (!dirty) return true;
    if (!canSave) return false;
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/videos/${video.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: draft.title,
          path: draft.path,
          ...(coverSec === null ? {} : { thumbnailSec: coverSec }),
          tagState: draft.tagState,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? t("saveFailed"));
        return false;
      }
      const next: Draft = {
        title: data.title,
        path: data.path,
        tagState: data.tagState ?? draft.tagState,
      };
      setSaved(next);
      setDraft(next);
      if (typeof data.thumbnail === "string")
        setThumbnail(`${data.thumbnail}?v=${Date.now()}`);
      if (typeof data.thumbnailSec === "number") setThumbSec(data.thumbnailSec);
      setCoverSec(null);
      toast.success(t("saved"));
      // The name or the tags may have moved this video within its list.
      router.refresh();
      return true;
    } catch (cause) {
      setError((cause as Error).message || t("saveFailed"));
      return false;
    } finally {
      setSaving(false);
    }
  }

  function go(href: string | null) {
    if (!href) return;
    if (dirty) {
      setLeaving(href);
      return;
    }
    startNavigation(() => router.push(href));
  }

  async function saveAndGo(href: string | null) {
    if (!(await save())) return;
    setLeaving(null);
    if (href) startNavigation(() => router.push(href));
  }

  async function recognize() {
    setRecognizeRequested(true);
    try {
      const res = await fetch(`/api/videos/${video.id}/retag`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast.success(t("recognizeQueued"));
    } catch (cause) {
      setRecognizeRequested(false);
      toast.error((cause as Error).message || common("operationFailed"));
    }
  }

  function takeCover() {
    const current = player.current?.currentTime;
    if (current === undefined) return;
    setCoverSec(Math.round(current * 10) / 10);
  }

  // Latest values for the key handler, which is bound once.
  const keys = useRef({ save, saveAndGo, go, previousHref, nextHref });
  useEffect(() => {
    keys.current = { save, saveAndGo, go, previousHref, nextHref };
  });

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const current = keys.current;
      const modifier = event.metaKey || event.ctrlKey;
      if (modifier && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void current.save();
      } else if (modifier && event.key === "Enter") {
        event.preventDefault();
        void current.saveAndGo(current.nextHref);
      } else if (modifier || event.altKey || isTyping(event.target)) {
        return;
      } else if (event.key === "[") {
        current.go(current.previousHref);
      } else if (event.key === "]") {
        current.go(current.nextHref);
      } else if (event.key === "t") {
        event.preventDefault();
        document.getElementById(TAG_INPUT_ID)?.focus();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const coverSrc =
    coverSec === null
      ? thumbnail
      : `/api/videos/${video.id}/frame?t=${coverSec}`;

  return (
    <>
      {/* The title takes the full width and the controls a row of their own,
          so a long name never squeezes either of them. */}
      <AdminPageHeader
        title={<span className="wrap-anywhere">{saved.title}</span>}
        description={`id=${video.id}`}
      />
      <div className="flex items-center gap-1">
        {neighbours.position !== null && (
          <>
            <Button
              variant="outline"
              size="icon"
              aria-label={t("previous")}
              title={t("previousShortcut")}
              disabled={!previousHref || navigating}
              onClick={() => go(previousHref)}
            >
              <ChevronLeftIcon />
            </Button>
            <span className="min-w-16 px-1 text-center text-xs text-muted-foreground tabular-nums">
              {neighbours.position} / {neighbours.total}
            </span>
            <Button
              variant="outline"
              size="icon"
              aria-label={t("next")}
              title={t("nextShortcut")}
              disabled={!nextHref || navigating}
              onClick={() => go(nextHref)}
            >
              {navigating ? <Spinner /> : <ChevronRightIcon />}
            </Button>
          </>
        )}
        <HelpTip side="bottom">{t("shortcuts")}</HelpTip>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="icon"
                aria-label={t("more")}
                className="ml-auto"
              />
            }
          >
            <EllipsisVerticalIcon />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-40">
            <DropdownMenuGroup>
              <DropdownMenuItem
                render={
                  <Link
                    href={`/video/${video.id}`}
                    target="_blank"
                    rel="noreferrer"
                  />
                }
              >
                <PlayIcon />
                {t("openPlayer")}
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem
                variant="destructive"
                onClick={() => setDeleteOpen(true)}
              >
                <Trash2Icon />
                {common("delete")}
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
        <Button
          className="ml-1"
          disabled={!dirty || !canSave}
          title={t("saveShortcut")}
          onClick={() => void save()}
        >
          {saving && <Spinner data-icon="inline-start" />}
          {saving ? common("saving") : common("save")}
        </Button>
      </div>

      {error && (
        <Alert variant="destructive">
          <CircleXIcon />
          <AlertTitle>{error}</AlertTitle>
        </Alert>
      )}

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_22rem] xl:grid-cols-[minmax(0,1fr)_26rem]">
        <div className="flex min-w-0 flex-col gap-2 lg:sticky lg:top-4">
          <VideoPlayer
            videoId={video.id}
            src={`/api/stream/${video.id}`}
            poster={thumbnail ?? undefined}
            initialViews={views}
            meta={playerMeta}
            countViews={false}
            playerRef={player}
          />

          <div className="flex flex-wrap items-center gap-3 rounded-lg border p-2">
            <div className="relative aspect-video w-24 shrink-0 overflow-hidden rounded bg-muted">
              {coverSrc && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={coverSrc}
                  src={coverSrc}
                  alt={t("thumbnailPreview")}
                  className="size-full object-cover"
                />
              )}
            </div>
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="text-xs font-medium">{t("thumbnail")}</span>
              <span className="text-xs text-muted-foreground tabular-nums">
                {coverSec === null
                  ? coverTime(thumbSec)
                  : t("coverPending", { time: coverTime(coverSec) })}
              </span>
            </div>
            <div className="flex gap-1">
              {coverSec !== null && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setCoverSec(null)}
                >
                  <Undo2Icon data-icon="inline-start" />
                  {t("undoCover")}
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={takeCover}>
                <ImageIcon data-icon="inline-start" />
                {t("useCurrentFrame")}
              </Button>
            </div>
          </div>
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle>{common("tags")}</CardTitle>
              <CardAction>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={recognizing}
                  onClick={() => void recognize()}
                >
                  {recognizing ? (
                    <Spinner data-icon="inline-start" />
                  ) : (
                    <SparklesIcon data-icon="inline-start" />
                  )}
                  Smartag
                </Button>
              </CardAction>
            </CardHeader>
            <CardContent>
              <TagEditor
                value={draft.tagState}
                onChange={(tagState) =>
                  setDraft((current) => ({ ...current, tagState }))
                }
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("details")}</CardTitle>
            </CardHeader>
            <CardContent>
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="video-title">
                    {common("name")}
                  </FieldLabel>
                  <Textarea
                    id="video-title"
                    value={draft.title}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        title: singleLine(event.target.value),
                      }))
                    }
                    onKeyDown={preventNewline}
                    placeholder={fileBaseName(draft.path)}
                  />
                  <FieldDescription>{t("nameHint")}</FieldDescription>
                </Field>
                <Field data-invalid={pathError ? true : undefined}>
                  <FieldLabel htmlFor="video-path">{t("path")}</FieldLabel>
                  <InputGroup data-invalid={pathError ? true : undefined}>
                    <InputGroupTextarea
                      id="video-path"
                      value={draft.path}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          path: singleLine(event.target.value),
                        }))
                      }
                      onKeyDown={preventNewline}
                      aria-invalid={pathError ? true : undefined}
                      spellCheck={false}
                      required
                      className="font-mono"
                    />
                    {/* Reports one thing only: whether a file is there. */}
                    <InputGroupAddon align="inline-end">
                      {checkingPath ? (
                        <Spinner />
                      ) : pathExists ? (
                        <CircleCheckIcon className="text-success" />
                      ) : (
                        <CircleXIcon className="text-destructive" />
                      )}
                    </InputGroupAddon>
                  </InputGroup>
                  {pathError && (
                    <FieldDescription className="text-destructive">
                      {pathError}
                    </FieldDescription>
                  )}
                </Field>
              </FieldGroup>
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog
        open={leaving !== null}
        onOpenChange={(open) => !open && setLeaving(null)}
      >
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>{t("unsavedTitle")}</DialogTitle>
            <DialogDescription>{t("unsavedDescription")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLeaving(null)}>
              {common("cancel")}
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                const href = leaving;
                setLeaving(null);
                if (href) startNavigation(() => router.push(href));
              }}
            >
              {t("discard")}
            </Button>
            <Button disabled={!canSave} onClick={() => void saveAndGo(leaving)}>
              {saving && <Spinner data-icon="inline-start" />}
              {t("saveAndContinue")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <VideoDeleteDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        videoId={video.id}
        title={saved.title}
        onDeleted={() => {
          setDeleteOpen(false);
          toast.success(actions("deleted"));
          // The neighbour takes its place; with none, the list does.
          const href = nextHref ?? previousHref;
          router.replace(href ?? "/admin/videos");
        }}
      />
    </>
  );
}
