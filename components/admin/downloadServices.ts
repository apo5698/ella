import type { BaiduSetupStatus } from "@/lib/utilities/baiduSetup";

/**
 * A service that download sources are hosted on. It is set up once in
 * Settings, and every source that uses it shares that setup.
 */
export type DownloadService = {
  /** Key in the Utilities namespace. */
  name: "baidu";
  statusUrl: string;
  // Each service reads its own status shape.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  isReady: (status: any) => boolean;
};

/** Where download services are set up. */
export const DOWNLOAD_SERVICES_HREF = "/settings/downloads";

export const DOWNLOAD_SERVICES = {
  baidu: {
    name: "baidu",
    statusUrl: "/api/admin/utilities/baidu/setup",
    isReady: (status: BaiduSetupStatus) =>
      status.installed &&
      status.mediaTools &&
      status.storageWritable &&
      status.account !== null,
  },
} satisfies Record<string, DownloadService>;
