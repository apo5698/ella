import { connection } from "next/server";
import { version } from "@/package.json";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  compareVersions,
  getLatestRelease,
  RELEASES_URL,
} from "@/lib/releases";

export default async function SystemVersion() {
  await connection();
  const currentVersion = process.env.APP_VERSION || version;
  const release = await getLatestRelease();
  const comparison =
    release.status === "available"
      ? compareVersions(currentVersion, release.version)
      : null;
  const status =
    comparison === null
      ? null
      : comparison < 0
        ? "有新版本"
        : comparison === 0
          ? "已是最新版本"
          : "开发版本";

  return (
    <Card>
      <CardHeader>
        <CardTitle>系统版本</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-3">
          <dt>当前版本</dt>
          <dd className="break-all">v{currentVersion}</dd>
          <dt>最新版本</dt>
          <dd>
            {release.status === "available"
              ? `v${release.version}`
              : release.status === "empty"
                ? "暂无正式版本"
                : "暂时无法检查更新，请稍后重试。"}
          </dd>
        </dl>
        {status && (
          <Badge
            variant={
              comparison !== null && comparison < 0 ? "default" : "secondary"
            }
          >
            {status}
          </Badge>
        )}
      </CardContent>
      <CardFooter>
        <Button
          nativeButton={false}
          variant="outline"
          render={
            <a
              href={release.status === "available" ? release.url : RELEASES_URL}
              target="_blank"
              rel="noreferrer"
            />
          }
        >
          查看发布说明
        </Button>
      </CardFooter>
    </Card>
  );
}
