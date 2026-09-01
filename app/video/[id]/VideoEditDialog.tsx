"use client";

import { useEffect, useState } from "react";
import { useForm } from "@tanstack/react-form";
import { CircleCheck, CircleX } from "lucide-react";
import { z } from "zod";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Slider } from "@/components/ui/slider";
import { Spinner } from "@/components/ui/spinner";
import { formatDuration } from "@/lib/format";
import TagEditor from "./TagEditor";
import type { PathCheck } from "@/app/api/videos/path-check/route";
import type {
  EditableVideo,
  VideoDetailTag,
  VideoMetadataPatch,
  VideoTagState,
} from "@/lib/types";

/**
 * The fields submit from a button that sits outside them, so the two are tied
 * together by id.
 */
const FORM_ID = "video-edit-form";

/** How long the field rests before the server is asked about the path. */
const PATH_DEBOUNCE_MS = 300;
/** How long the slider rests before the frame at that position is decoded. */
const FRAME_DEBOUNCE_MS = 180;

const pathSchema = z.string().trim().min(1, "路径不能为空");

const titleSchema = z.string();

/** The name a video takes when the name field is left empty. */
function fileBaseName(fullPath: string): string {
  const name = fullPath.split("/").pop() ?? "";
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(0, dot) : name;
}

export default function VideoEditDialog({
  open,
  onOpenChange,
  video,
  initialThumbSec,
  initialPathExists,
  tags,
  rejectedTags,
  seriesName,
  onSaved,
  onTagStateChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  video: EditableVideo;
  initialThumbSec: number;
  initialPathExists: boolean;
  tags: VideoDetailTag[];
  rejectedTags: string[];
  seriesName: string | null;
  onSaved: (patch: VideoMetadataPatch) => void;
  onTagStateChange: (state: VideoTagState) => void;
}) {
  // Whether a file sits at the typed path, which drives the mark inside the
  // input. Seeded from the server so it is right before anything is typed.
  const [pathExists, setPathExists] = useState(initialPathExists);
  // Where the thumb is right now, versus which frame is actually on screen.
  const [sliderSec, setSliderSec] = useState(initialThumbSec);
  const [frameSec, setFrameSec] = useState(initialThumbSec);
  const [frameLoading, setFrameLoading] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [tagDraft, setTagDraft] = useState<VideoTagState>({
    tags,
    rejectedTags,
    seriesName,
  });

  const duration = video.duration_sec ?? 0;

  // Decoding trails the thumb rather than waiting for release, so the picture
  // keeps up with a drag. The equality guard stops the first render from
  // raising a spinner over a frame that is already there.
  useEffect(() => {
    if (sliderSec === frameSec) return;
    const timer = setTimeout(() => {
      setFrameSec(sliderSec);
      setFrameLoading(true);
    }, FRAME_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [sliderSec, frameSec]);

  const form = useForm({
    defaultValues: {
      title: video.title,
      path: video.path,
      thumbnailSec: initialThumbSec,
      // Only a moved slider replaces the cover; an untouched one leaves it be.
      thumbnailTouched: false,
    },
    onSubmit: async ({ value }) => {
      setSubmitError("");
      const res = await fetch(`/api/videos/${video.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: value.title,
          path: value.path,
          ...(value.thumbnailTouched
            ? { thumbnailSec: value.thumbnailSec }
            : {}),
          tagState: tagDraft,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSubmitError(data.error ?? "保存失败");
        return;
      }
      onSaved({
        title: data.title,
        path: data.path,
        ...(typeof data.thumbnail === "string"
          ? { thumbnail: `${data.thumbnail}?v=${Date.now()}` }
          : {}),
        ...(typeof data.thumbnailSec === "number"
          ? { thumbnailSec: data.thumbnailSec }
          : {}),
      });
      if (data.tagState) onTagStateChange(data.tagState);
      onOpenChange(false);
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-5/6 flex-col overflow-hidden sm:max-w-2xl">
        <DialogHeader className="shrink-0">
          <DialogTitle>编辑视频</DialogTitle>
        </DialogHeader>

        <ScrollArea className="min-h-0 flex-1">
          <div className="flex flex-col gap-4 pr-3">
            <form
              id={FORM_ID}
              onSubmit={(e) => {
                e.preventDefault();
                e.stopPropagation();
                void form.handleSubmit();
              }}
            >
              <FieldGroup>
                <form.Field name="title" validators={{ onChange: titleSchema }}>
                  {(field) => (
                    <Field>
                      <FieldLabel htmlFor="video-title">名称</FieldLabel>
                      <Input
                        id="video-title"
                        value={field.state.value}
                        onChange={(e) => field.handleChange(e.target.value)}
                        onBlur={field.handleBlur}
                        placeholder={fileBaseName(form.getFieldValue("path"))}
                      />
                      <FieldDescription>留空则使用文件名。</FieldDescription>
                    </Field>
                  )}
                </form.Field>

                <form.Field
                  name="path"
                  validators={{
                    onChange: pathSchema,
                    // Purpose-built for this: the server is asked only once the
                    // field has been still for a moment, not on every keystroke.
                    onChangeAsyncDebounceMs: PATH_DEBOUNCE_MS,
                    onChangeAsync: async ({ value }) => {
                      const trimmed = value.trim();
                      if (!trimmed) return undefined;
                      try {
                        const res = await fetch(
                          `/api/videos/path-check?path=${encodeURIComponent(trimmed)}&id=${video.id}`,
                        );
                        const check: PathCheck = await res.json();
                        setPathExists(check.exists);
                        return check.taken
                          ? `已被视频"${check.takenBy?.title}"使用。`
                          : undefined;
                      } catch {
                        // Offline or mid-restart. Saving still validates server side.
                        return undefined;
                      }
                    },
                  }}
                >
                  {(field) => {
                    const errors = field.state.meta.errors;
                    const invalid = errors.length > 0;
                    const validating = field.state.meta.isValidating;
                    return (
                      <Field data-invalid={invalid || undefined}>
                        <FieldLabel htmlFor="video-path">路径</FieldLabel>
                        <InputGroup data-invalid={invalid || undefined}>
                          <InputGroupInput
                            id="video-path"
                            value={field.state.value}
                            onChange={(e) => field.handleChange(e.target.value)}
                            onBlur={field.handleBlur}
                            aria-invalid={invalid}
                            spellCheck={false}
                            required
                            className="font-mono"
                          />
                          {/* Reports one thing only: whether a file is there. */}
                          <InputGroupAddon align="inline-end">
                            {validating ? (
                              <Spinner />
                            ) : pathExists && field.state.value.trim() ? (
                              <CircleCheck className="text-success" />
                            ) : (
                              <CircleX className="text-destructive" />
                            )}
                          </InputGroupAddon>
                        </InputGroup>
                        {invalid && (
                          <FieldDescription className="text-destructive">
                            {String(
                              typeof errors[0] === "string"
                                ? errors[0]
                                : (errors[0] as { message?: string })?.message,
                            )}
                          </FieldDescription>
                        )}
                      </Field>
                    );
                  }}
                </form.Field>

                <form.Field name="thumbnailSec">
                  {(field) => (
                    <Field>
                      <FieldLabel>封面</FieldLabel>
                      <div className="relative w-full max-w-sm overflow-hidden rounded-lg bg-muted aspect-video">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={`/api/videos/${video.id}/frame?t=${Math.round(frameSec)}`}
                          alt="封面预览"
                          className="h-full w-full object-cover"
                          onLoad={() => setFrameLoading(false)}
                          onError={() => setFrameLoading(false)}
                        />
                        {frameLoading && (
                          <div className="absolute inset-0 flex items-center justify-center bg-background/50">
                            <Spinner className="size-5" />
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-3">
                        <span
                          id="video-thumbnail-position-label"
                          className="sr-only"
                        >
                          封面位置
                        </span>
                        <Slider
                          min={0}
                          max={Math.max(Math.floor(duration) - 1, 0)}
                          step={1}
                          value={[field.state.value]}
                          onValueChange={(values) => {
                            const next = Array.isArray(values)
                              ? values[0]
                              : values;
                            if (next === undefined) return;
                            field.handleChange(next);
                            form.setFieldValue("thumbnailTouched", true);
                            setSliderSec(next);
                          }}
                          aria-labelledby="video-thumbnail-position-label"
                          className="flex-1"
                        />
                        <span className="w-16 shrink-0 text-right text-sm tabular-nums">
                          {formatDuration(Math.round(field.state.value))}
                        </span>
                      </div>
                      <FieldDescription>
                        拖动以选取画面。不调整则保留当前封面。
                      </FieldDescription>
                    </Field>
                  )}
                </form.Field>
              </FieldGroup>
            </form>

            {/* Kept outside the form so Enter in an autocomplete never closes
                the dialog. Its draft is included by the Save handler above. */}
            <Field>
              <TagEditor
                initialTags={tags}
                initialRejected={rejectedTags}
                initialSeries={seriesName}
                onChange={setTagDraft}
              />
            </Field>

            {submitError && (
              <p className="text-sm text-destructive">{submitError}</p>
            )}
          </div>
        </ScrollArea>

        <DialogFooter className="shrink-0">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            取消
          </Button>
          <form.Subscribe
            selector={(s) => [s.canSubmit, s.isSubmitting] as const}
          >
            {([canSubmit, isSubmitting]) => (
              <Button
                type="submit"
                form={FORM_ID}
                disabled={!canSubmit || isSubmitting}
              >
                {isSubmitting ? "保存中" : "保存"}
              </Button>
            )}
          </form.Subscribe>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
