"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import {
  DownloadQueue,
  type DownloadSourceFieldsProps,
} from "@/components/admin/DownloadQueue";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import { formatSize } from "@/lib/format";
import type { DownloadProgress } from "@/lib/utilities/httpsource";
import {
  HTTP_SOURCE_DEFAULT_PASSWORD,
  httpsourceDownloadSchema,
  type HttpSourceDownloadInput,
} from "@/lib/utilities/httpsourceSchema";

function HttpSourceFields({
  entryId,
  value,
  disabled,
  errors,
  hasConflict,
  onChange,
}: DownloadSourceFieldsProps<HttpSourceDownloadInput>) {
  const [passwordVisible, setPasswordVisible] = useState(false);
  const nameInvalid = Boolean(errors.name?.length || hasConflict);
  const urlInvalid = Boolean(errors.url?.length);

  return (
    <FieldGroup>
      <Field
        data-disabled={disabled || undefined}
        data-invalid={nameInvalid || undefined}
      >
        <FieldLabel htmlFor={`httpsource-${entryId}-name`}>文件名</FieldLabel>
        <Input
          id={`httpsource-${entryId}-name`}
          value={value.name}
          disabled={disabled}
          aria-invalid={nameInvalid || undefined}
          onChange={(event) => onChange("name", event.target.value)}
        />
        <FieldDescription>无需填写扩展名</FieldDescription>
        <FieldError errors={errors.name} />
      </Field>
      <Field
        data-disabled={disabled || undefined}
        data-invalid={urlInvalid || undefined}
      >
        <FieldLabel htmlFor={`httpsource-${entryId}-url`}>视频 URL</FieldLabel>
        <Input
          id={`httpsource-${entryId}-url`}
          value={value.url}
          type="url"
          disabled={disabled}
          aria-invalid={urlInvalid || undefined}
          onChange={(event) => onChange("url", event.target.value)}
        />
        <FieldError errors={errors.url} />
      </Field>
      <Field data-disabled={disabled || undefined}>
        <FieldLabel htmlFor={`httpsource-${entryId}-password`}>
          解压密码
        </FieldLabel>
        <InputGroup>
          <InputGroupInput
            id={`httpsource-${entryId}-password`}
            value={value.password}
            type={passwordVisible ? "text" : "password"}
            autoComplete="off"
            disabled={disabled}
            onChange={(event) => onChange("password", event.target.value)}
          />
          <InputGroupAddon align="inline-end">
            <InputGroupButton
              type="button"
              size="icon-xs"
              aria-label={passwordVisible ? "隐藏密码" : "显示密码"}
              aria-pressed={passwordVisible}
              disabled={disabled}
              onClick={() => setPasswordVisible((visible) => !visible)}
            >
              {passwordVisible ? <EyeOff /> : <Eye />}
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
      </Field>
    </FieldGroup>
  );
}

function presentProgress(progress: DownloadProgress) {
  if (progress.phase === "downloading") {
    return {
      label: "下载中",
      percent: progress.total
        ? Math.round((progress.received / progress.total) * 100)
        : null,
      detail: progress.total
        ? `${formatSize(progress.received)} / ${formatSize(progress.total)}`
        : progress.received > 0
          ? formatSize(progress.received)
          : null,
    };
  }
  if (progress.phase === "extracting") {
    return { label: "解压中", percent: progress.percent };
  }
  return { label: "录入中", percent: null };
}

export default function HttpSourceDownloader() {
  return (
    <DownloadQueue
      endpoint="/api/admin/utilities/httpsource"
      createFields={() => ({
        name: "",
        url: "",
        password: HTTP_SOURCE_DEFAULT_PASSWORD,
      })}
      schema={httpsourceDownloadSchema}
      fields={HttpSourceFields}
      getRequestedName={(fields) => fields.name}
      presentProgress={presentProgress}
    />
  );
}
