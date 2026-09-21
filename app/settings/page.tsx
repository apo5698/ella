import Link from "next/link";
import { Suspense } from "react";
import { ChevronRightIcon } from "lucide-react";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import LoadingSpinner from "@/components/LoadingSpinner";
import SystemVersion from "@/components/settings/SystemVersion";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function SettingsPage() {
  return (
    <>
      <AdminPageHeader title="设置" />
      <div className="flex max-w-2xl flex-col gap-4">
        <Suspense
          fallback={
            <Card>
              <CardHeader>
                <CardTitle>软件更新</CardTitle>
              </CardHeader>
              <CardContent>
                <LoadingSpinner className="min-h-32" label="正在检查更新" />
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
              <div className="flex flex-col gap-1">
                <CardTitle>智能识别</CardTitle>
                <CardDescription>模型、抽帧与自动标签</CardDescription>
              </div>
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
