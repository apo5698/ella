import { request } from "node:http";
import { z } from "zod";

export const updateStatusSchema = z.object({
  state: z.enum(["idle", "pulling", "restarting", "succeeded", "failed"]),
  version: z.string().nullable(),
  message: z.string(),
});
export type UpdateStatus = z.infer<typeof updateStatusSchema>;

/** Why the updater cannot be reached, so the page can say what to fix. */
export type UpdaterUnavailableReason =
  "development" | "notInstalled" | "notRunning" | "permission" | "unreachable";

export function callUpdater(
  method: "GET" | "POST",
  version?: string,
): Promise<UpdateStatus> {
  return new Promise((resolve, reject) => {
    const body = method === "POST" ? JSON.stringify({ version }) : undefined;
    const req = request(
      {
        socketPath:
          process.env.ELLA_UPDATER_SOCKET || "/run/ella-updater/control.sock",
        path: "/update",
        method,
        headers: body
          ? {
              "Content-Type": "application/json",
              "Content-Length": Buffer.byteLength(body),
            }
          : {},
      },
      (response) => {
        let data = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          data += chunk;
          if (data.length > 16384)
            req.destroy(new Error("Invalid updater response"));
        });
        response.on("error", reject);
        response.on("end", () => {
          try {
            if (!response.statusCode || response.statusCode >= 400)
              throw new Error("Updater rejected request");
            resolve(updateStatusSchema.parse(JSON.parse(data)));
          } catch (error) {
            reject(error);
          }
        });
      },
    );
    req.setTimeout(5000, () => req.destroy(new Error("Updater timeout")));
    req.on("error", reject);
    req.end(body);
  });
}
