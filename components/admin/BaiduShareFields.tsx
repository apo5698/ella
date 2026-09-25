"use client";

import { useTranslations } from "next-intl";
import type { DownloadSourceFieldsProps } from "@/components/admin/downloadSources";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { BaiduShare } from "@/lib/utilities/baiduShareSchema";

type BaiduShareFieldValues = BaiduShare & { name: string };

/** The form for any source whose files are shared on Baidu Netdisk. */
export default function BaiduShareFields({
  entryId,
  value,
  disabled,
  errors,
  hasConflict,
  onChange,
}: DownloadSourceFieldsProps<BaiduShareFieldValues>) {
  const t = useTranslations("DownloadFields");
  return (
    <FieldGroup>
      {(["url", "code", "name"] as const).map((key) => {
        const invalid = Boolean(
          errors[key]?.length || (key === "name" && hasConflict),
        );
        const id = `baidu-share-${entryId}-${key}`;
        return (
          <Field
            key={key}
            data-disabled={disabled || undefined}
            data-invalid={invalid || undefined}
          >
            <FieldLabel htmlFor={id}>
              {t(
                key === "url"
                  ? "baiduUrl"
                  : key === "code"
                    ? "baiduCode"
                    : "name",
              )}
            </FieldLabel>
            <Input
              id={id}
              value={value[key]}
              required
              disabled={disabled}
              aria-invalid={invalid || undefined}
              type={key === "url" ? "url" : "text"}
              maxLength={key === "code" ? 4 : undefined}
              autoCapitalize={key === "name" ? undefined : "none"}
              spellCheck={key === "name" ? undefined : false}
              onChange={(event) => onChange(key, event.target.value)}
            />
            {key === "name" && (
              <FieldDescription>{t("nameHelp")}</FieldDescription>
            )}
            {key === "code" && (
              <FieldDescription>{t("baiduCodeHelp")}</FieldDescription>
            )}
            <FieldError errors={errors[key]} />
          </Field>
        );
      })}
    </FieldGroup>
  );
}
