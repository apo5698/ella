import Link from "next/link";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { UTILITY_MODULES } from "@/lib/utilities/registry";

export default function UtilitiesPage() {
  return (
    <>
      <AdminPageHeader
        title="实用工具"
        description="按需添加和使用媒体库工具"
      />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {UTILITY_MODULES.map((module) => {
          const Icon = module.icon;
          return (
            <Link key={module.slug} href={module.href} className="group">
              <Card className="h-full transition-colors group-hover:border-foreground/20">
                <CardHeader>
                  <Icon className="size-4 text-muted-foreground" />
                  <CardTitle>{module.name}</CardTitle>
                  <CardDescription>{module.description}</CardDescription>
                </CardHeader>
              </Card>
            </Link>
          );
        })}
      </div>
    </>
  );
}
