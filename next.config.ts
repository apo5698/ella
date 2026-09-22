import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const nextConfig: NextConfig = {
  // Emit a minimal, self-contained Node.js server for the production image.
  output: "standalone",

  // Additional development origins, supplied by the local environment.
  allowedDevOrigins: (process.env.ALLOWED_DEV_ORIGINS ?? "*.local")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),

  // 7zip-bin locates its bundled binary with __dirname, which the server
  // bundler rewrites to a placeholder root, producing paths like
  // /ROOT/node_modules/7zip-bin/linux/x64/7za. Keeping the package external
  // leaves it as a plain Node require, so __dirname is the real directory.
  serverExternalPackages: ["7zip-bin"],
};

const withNextIntl = createNextIntlPlugin();

export default withNextIntl(nextConfig);
