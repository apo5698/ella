"use client";

import { useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { setLanguage } from "@/app/settings/language";
import { isAppLocale } from "@/i18n/config";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export default function LanguageSettings() {
  const locale = useLocale();
  const t = useTranslations("Settings");
  const common = useTranslations("Common");
  const [pending, startTransition] = useTransition();
  const items = [
    { value: "en", label: t("english") },
    { value: "zh-CN", label: t("simplifiedChinese") },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle id="language-title">{t("language")}</CardTitle>
        <CardDescription id="language-description">
          {t("languageDescription")}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Select
          items={items}
          value={locale}
          disabled={pending}
          onValueChange={(value) => {
            if (!isAppLocale(value) || value === locale) return;
            startTransition(async () => {
              try {
                if (!(await setLanguage(value)))
                  toast.error(common("operationFailed"));
              } catch {
                toast.error(common("operationFailed"));
              }
            });
          }}
        >
          <SelectTrigger
            className="w-40"
            aria-labelledby="language-title"
            aria-describedby="language-description"
            aria-busy={pending}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="w-40" alignItemWithTrigger={false}>
            <SelectGroup>
              {items.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </CardContent>
    </Card>
  );
}
