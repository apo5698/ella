import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Emit a minimal, self-contained Node.js server for the production image.
  output: "standalone",

  // Next blocks cross-origin requests to dev-only assets by default, which
  // covers anything reaching the dev server by an address other than the one
  // it was started with. Without these, a phone on the LAN loads the page but
  // its HMR and dev asset requests are refused. The subnet is matched as a
  // pattern because WSL takes its address by DHCP.
  allowedDevOrigins: ["10.0.0.*", "*.local"],

  // 7zip-bin locates its bundled binary with __dirname, which the server
  // bundler rewrites to a placeholder root, producing paths like
  // /ROOT/node_modules/7zip-bin/linux/x64/7za. Keeping the package external
  // leaves it as a plain Node require, so __dirname is the real directory.
  serverExternalPackages: ["7zip-bin"],
};

export default nextConfig;
