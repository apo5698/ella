"use client";

import { useTranslations } from "next-intl";

import { useState } from "react";
import { EyeIcon, EyeOffIcon } from "lucide-react";
import type { DownloadSourceFieldsProps } from "@/components/admin/downloadSources";
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
import type { QinglanhuaDownloadInput } from "@/lib/utilities/qinglanhuaSchema";

export default function QinglanhuaFields({
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
