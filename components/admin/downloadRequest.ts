/** A JSON request to the download API. Throws with the server's message. */
export async function downloadRequest(
  url: string,
  method: "POST" | "DELETE",
  body?: unknown,
) {
  const response = await fetch(url, {
    method,
    ...(body === undefined
      ? {}
      : {
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error);
  return data;
}
