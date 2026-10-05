import { getTranslations } from "next-intl/server";
import LanguageSettings from "@/components/settings/LanguageSettings";
import Link from "next/link";
import { Suspense } from "react";
import { ChevronRightIcon } from "lucide-react";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import LoadingSpinner from "@/components/LoadingSpinner";
import SystemVersion from "@/components/settings/SystemVersion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function SettingsPage() {
  const t = await getTranslations("Settings");
  const systemUpdate = await getTranslations("SystemUpdate");
  const navigation = await getTranslations("Navigation");
  return (
    <>
      <AdminPageHeader title={navigation("settings")} />
      <div className="flex flex-col gap-4">
        <LanguageSettings />
        <Suspense
          fallback={
            <Card>
              <CardHeader>
                <CardTitle>{systemUpdate("title")}</CardTitle>
              </CardHeader>
              <CardContent>
                <LoadingSpinner
                  className="min-h-32"
                  label={t("checkingUpdates")}
                />
              </CardContent>
            </Card>
          }
        >
          <SystemVersion />
        </Suspense>
        <Link
          href="/settings/recognition"
          className="rounded-lg outline-offset-4"
        >
          <Card>
            <CardHeader className="grid-cols-[1fr_auto] items-center">
              <CardTitle>{navigation("recognition")}</CardTitle>
              <ChevronRightIcon
                aria-hidden="true"
                className="size-4 text-muted-foreground"
              />
            </CardHeader>
          </Card>
        </Link>
      </div>
    </>
  );
}
