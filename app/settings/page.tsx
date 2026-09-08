import Link from "next/link";
import { Suspense } from "react";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import SystemVersion from "@/components/settings/SystemVersion";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function SettingsPage() {
  return (
    <>
      <AdminPageHeader
        title="设置"
        description="查看系统信息，管理 Ella 的各项设置。"
      />
      <div className="flex max-w-3xl flex-col gap-4">
        <Suspense
          fallback={
            <Card>
              <CardHeader>
                <CardTitle>系统版本</CardTitle>
              </CardHeader>
              <CardContent role="status">正在检查版本…</CardContent>
            </Card>
          }
        >
          <SystemVersion />
        </Suspense>
        <Card>
          <CardHeader>
            <CardTitle>智能识别</CardTitle>
            <CardDescription>
              识别模型、视频抽帧和自动标签任务。
            </CardDescription>
          </CardHeader>
          <CardFooter>
            <Button
              nativeButton={false}
              variant="outline"
              render={<Link href="/settings/recognition" />}
            >
              配置智能识别
            </Button>
          </CardFooter>
        </Card>
      </div>
    </>
  );
}
