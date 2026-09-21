import { connection } from "next/server";
import { version } from "@/package.json";
import { getLatestRelease } from "@/lib/releases";
import SystemUpdate from "./SystemUpdate";

export default async function SystemVersion() {
  await connection();
  return (
    <SystemUpdate
      currentVersion={process.env.APP_VERSION || version}
      initialRelease={await getLatestRelease()}
    />
  );
}
