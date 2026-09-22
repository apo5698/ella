import { getTranslations } from "next-intl/server";
import Link from "next/link";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { UTILITY_MODULES } from "@/lib/utilities/registry";

export default async function UtilitiesPage() {
  const t = await getTranslations("Utilities");
  return (
    <>
      <AdminPageHeader title={t("title")} description={t("description")} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {UTILITY_MODULES.map((module) => {
          const Icon = module.icon;
          return (
            <Link key={module.slug} href={module.href} className="group">
              <Card className="h-full transition-colors group-hover:border-foreground/20">
                <CardHeader>
                  <Icon className="size-4 text-muted-foreground" />
                  <CardTitle>{t(module.name)}</CardTitle>
                  <CardDescription>{t(module.description)}</CardDescription>
                </CardHeader>
              </Card>
            </Link>
          );
        })}
      </div>
    </>
  );
}
