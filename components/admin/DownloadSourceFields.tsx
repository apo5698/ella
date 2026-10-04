"use client";

import { useTranslations } from "next-intl";

import { useState, type ChangeEvent } from "react";
import { EyeIcon, EyeOffIcon } from "lucide-react";
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
import {
  downloadFields,
  type DownloadField,
  type DownloadSource,
} from "@/lib/utilities/downloadSources";

export type DownloadFields = { name: string } & Record<string, string>;

export type DownloadFieldErrors = Partial<
  Record<string, Array<{ message?: string }>>
>;

/** The fields one download of `source` asks for, as its settings describe. */
export default function DownloadSourceFields({
  source,
  entryId,
  value,
  disabled,
  errors,
  hasConflict,
  onChange,
}: {
  source: DownloadSource;
  entryId: number;
  value: DownloadFields;
  disabled: boolean;
  errors: DownloadFieldErrors;
  /** The name clashes with the library, as the server answered. */
  hasConflict: boolean;
  onChange: (field: DownloadField, value: string) => void;
}) {
  const t = useTranslations("DownloadFields");
  const [passwordVisible, setPasswordVisible] = useState(false);
  const share = source.transport === "baidu-share";

  const label: Record<DownloadField, string> = {
    url: share ? t("baiduUrl") : t("url"),
    code: t("baiduCode"),
    password: t("password"),
    name: t("name"),
  };
  const help: Partial<Record<DownloadField, string>> = {
    code: t("baiduCodeHelp"),
    name: t("nameHelp"),
  };

  return (
    <FieldGroup>
      {downloadFields(source).map((field) => {
        const invalid = Boolean(
          errors[field]?.length || (field === "name" && hasConflict),
        );
        const id = `download-${entryId}-${field}`;
        const common = {
          id,
          value: value[field] ?? "",
          disabled,
          "aria-invalid": invalid || undefined,
          onChange: (event: ChangeEvent<HTMLInputElement>) =>
            onChange(field, event.target.value),
        };
        return (
          <Field
            key={field}
            data-disabled={disabled || undefined}
            data-invalid={invalid || undefined}
          >
            <FieldLabel htmlFor={id}>{label[field]}</FieldLabel>
            {field === "password" ? (
              <InputGroup>
                <InputGroupInput
                  {...common}
                  type={passwordVisible ? "text" : "password"}
                  autoComplete="off"
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
            ) : (
              <Input
                {...common}
                type={field === "url" ? "url" : "text"}
                maxLength={field === "code" ? 4 : undefined}
                autoCapitalize={field === "name" ? undefined : "none"}
                spellCheck={field === "name" ? undefined : false}
              />
            )}
            {help[field] && <FieldDescription>{help[field]}</FieldDescription>}
            <FieldError errors={errors[field]} />
          </Field>
        );
      })}
    </FieldGroup>
  );
}
