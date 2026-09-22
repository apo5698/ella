"use client";

import { useTranslations } from "next-intl";

import { useState } from "react";
import { EyeIcon, EyeOffIcon } from "lucide-react";
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
import type { DownloadProgress } from "@/lib/utilities/qinglanhua";
import {
  QINGLANHUA_DEFAULT_PASSWORD,
  createQinglanhuaDownloadSchema,
  type QinglanhuaDownloadInput,
} from "@/lib/utilities/qinglanhuaSchema";

function QinglanhuaFields({
  entryId,
  value,
  disabled,
  errors,
  hasConflict,
  onChange,
}: DownloadSourceFieldsProps<QinglanhuaDownloadInput>) {
  const t = useTranslations("DownloadFields");
  const [passwordVisible, setPasswordVisible] = useState(false);
  const nameInvalid = Boolean(errors.name?.length || hasConflict);
  const urlInvalid = Boolean(errors.url?.length);

  return (
    <FieldGroup>
      <Field
        data-disabled={disabled || undefined}
        data-invalid={nameInvalid || undefined}
      >
        <FieldLabel htmlFor={`qinglanhua-${entryId}-name`}>
          {t("name")}
        </FieldLabel>
        <Input
          id={`qinglanhua-${entryId}-name`}
          value={value.name}
          disabled={disabled}
          aria-invalid={nameInvalid || undefined}
          onChange={(event) => onChange("name", event.target.value)}
        />
        <FieldDescription>{t("nameHelp")}</FieldDescription>
        <FieldError errors={errors.name} />
      </Field>
      <Field
        data-disabled={disabled || undefined}
        data-invalid={urlInvalid || undefined}
      >
        <FieldLabel htmlFor={`qinglanhua-${entryId}-url`}>
          {t("url")}
        </FieldLabel>
        <Input
          id={`qinglanhua-${entryId}-url`}
          value={value.url}
          type="url"
          disabled={disabled}
          aria-invalid={urlInvalid || undefined}
          onChange={(event) => onChange("url", event.target.value)}
        />
        <FieldError errors={errors.url} />
      </Field>
      <Field data-disabled={disabled || undefined}>
        <FieldLabel htmlFor={`qinglanhua-${entryId}-password`}>
          {t("password")}
        </FieldLabel>
        <InputGroup>
          <InputGroupInput
            id={`qinglanhua-${entryId}-password`}
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
              aria-label={
                passwordVisible ? t("hidePassword") : t("showPassword")
              }
              aria-pressed={passwordVisible}
              disabled={disabled}
              onClick={() => setPasswordVisible((visible) => !visible)}
            >
              {passwordVisible ? <EyeOffIcon /> : <EyeIcon />}
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
      </Field>
    </FieldGroup>
  );
}

function presentProgress(
  progress: DownloadProgress,
  t: (key: string) => string,
) {
  if (progress.phase === "downloading") {
    return {
      label: t("downloading"),
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
    return { label: t("extracting"), percent: progress.percent };
  }
  return { label: t("importing"), percent: null };
}

export default function QinglanhuaDownloader() {
  const validation = useTranslations("DownloadValidation");
  const t = useTranslations("DownloadFields");
  return (
    <DownloadQueue
      endpoint="/api/admin/utilities/qinglanhua"
      createFields={() => ({
        name: "",
        url: "",
        password: QINGLANHUA_DEFAULT_PASSWORD,
      })}
      schema={createQinglanhuaDownloadSchema(validation)}
      fields={QinglanhuaFields}
      getRequestedName={(fields) => fields.name}
      presentProgress={(progress: DownloadProgress) =>
        presentProgress(progress, t)
      }
    />
  );
}
