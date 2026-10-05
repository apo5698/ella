// Reinstalls every registry component in components/ui from the shadcn
// registry, so a hand edit there does not survive the next build. Runs before
// `next build`. The Docker build sets ELLA_SKIP_UI_SYNC and compiles the
// committed files, so an image never carries changes nobody reviewed.
import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import path from "node:path";

/** Components in components/ui that the registry does not provide. */
const LOCAL = new Set(["dot"]);

if (process.env.ELLA_SKIP_UI_SYNC) process.exit(0);

const names = readdirSync("components/ui")
  .filter((file) => file.endsWith(".tsx"))
  .map((file) => path.basename(file, ".tsx"))
  .filter((name) => !LOCAL.has(name));

try {
  execFileSync(
    path.join("node_modules", ".bin", "shadcn"),
    ["add", ...names, "--overwrite", "--yes", "--silent"],
    // Errors only: the CLI prints setup notes for each component on stdout.
    { stdio: ["ignore", "ignore", "inherit"] },
  );
} catch {
  // Offline, or the registry is down: build with the files as they are.
  console.warn(
    "[ui] Unable to reach the shadcn registry; components/ui unchanged",
  );
}
