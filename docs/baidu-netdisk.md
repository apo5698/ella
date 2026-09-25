# Baidu Netdisk

Download sources hosted on Baidu Netdisk share one connection. Set it up once
in **Settings → Download Services**; every Baidu-hosted source uses it. When it
is not ready, the **New Download** dialog shows a notice with a link to that page instead
of the source's form.

Sources differ only in what the shared files contain. Each source validates its
own layout after the transfer; see [SYKB](sykb.md) for an example.

## Setup wizard

1. **Prepare environment.** The official Docker image includes BaiduPCS-Go,
   FFmpeg, FFprobe and 7zip. On Linux amd64 or arm64, the wizard can install the
   pinned BaiduPCS-Go release automatically. It verifies the archive's SHA-256
   before installing into the app data directory. No root access is required.
2. **Connect account.** Open Baidu Netdisk and sign in. Follow the in-page steps
   to copy the Baidu request Cookie from your desktop browser and paste it into
   the masked field. It must include BDUSS and STOKEN. Ella verifies the account
   before saving it; an unsuccessful replacement preserves the working account.
3. **Check and finish.** Ella checks account access and the video directory before
   marking the service ready. Use **Manage connection** to repeat setup or change
   accounts later.

The browser cannot read another site's cookies automatically. Baidu login is the
user's step; no server commands or environment edits are required for the normal
Docker setup. Credentials are stored with owner-only file permissions and never
returned through the setup status API. Keep the data directory private.

Compose mounts the video library read-write by default. The wizard detects
missing or unwritable directories. Host mount permissions still need to be set
by the deployer: a web application cannot make a read-only Docker mount writable.
The app container runs as UID 1001. Other source deployments must provide FFmpeg
and FFprobe; the wizard reports missing tools.

## Baidu behavior

[BaiduPCS-Go](https://github.com/qjfoidnh/BaiduPCS-Go) uses `transfer --download`.
This needs a logged-in account and enough cloud space. Each task creates a unique
`/ella-<uuid>` directory in that account. Transferred files stay there after
success or failure; remove those copies from Baidu when no longer needed. Speeds
remain subject to Baidu account limits.

Some upstream failures still return exit code 0. Ella also checks output,
completion and both extraction results before importing.

## Advanced overrides

Existing deployments may retain `BAIDUPCS_GO_PATH` and
`BAIDUPCS_GO_CONFIG_DIR`. Without overrides, Ella uses the bundled executable or
its managed installation and keeps credentials beside the catalog database in
`baidupcs/`. The wizard uses these same paths, so the downloader sees saved
changes immediately without restarting.

## Adding a source hosted on Baidu Netdisk

1. **Schema.** Extend `createBaiduShareSchema` in
   `lib/utilities/baiduShareSchema.ts` with the source's own fields.
2. **Download.** Call `downloadBaiduShare`, which returns every file in the
   share. Check the layout the source expects, extract with
   `extractArchiveSafely` from `lib/utilities/safeArchive.ts`, and import with
   `importDownloadedVideo`. `lib/utilities/sykb.ts` is the reference.
3. **Register.** Add the source to `DOWNLOADER_SOURCES`
   (`lib/utilities/registry.ts`), `DOWNLOAD_SCHEMAS`
   (`lib/utilities/downloadSchemas.ts`) and `DOWNLOADERS`
   (`lib/taskRunner.ts`). In `DOWNLOAD_SOURCE_FORMS`
   (`components/admin/downloadSources.ts`), use `BaiduShareFields` and
   `service: DOWNLOAD_SERVICES.baidu` so the form and the setup check are shared.
