import { loader } from "@monaco-editor/react";

type Monaco = typeof import("monaco-editor");

let loading: Promise<Monaco> | undefined;

// Each sets the interface text as a global the editor module reads on load.
const MESSAGES: Record<string, () => Promise<unknown>> = {
  cs: () => import("monaco-editor/nls/lang/cs.js"),
  de: () => import("monaco-editor/nls/lang/de.js"),
  es: () => import("monaco-editor/nls/lang/es.js"),
  fr: () => import("monaco-editor/nls/lang/fr.js"),
  it: () => import("monaco-editor/nls/lang/it.js"),
  ja: () => import("monaco-editor/nls/lang/ja.js"),
  ko: () => import("monaco-editor/nls/lang/ko.js"),
  pl: () => import("monaco-editor/nls/lang/pl.js"),
  "pt-br": () => import("monaco-editor/nls/lang/pt-br.js"),
  ru: () => import("monaco-editor/nls/lang/ru.js"),
  tr: () => import("monaco-editor/nls/lang/tr.js"),
  "zh-cn": () => import("monaco-editor/nls/lang/zh-cn.js"),
  "zh-tw": () => import("monaco-editor/nls/lang/zh-tw.js"),
};

/** The first system language Monaco has text for, or none for English. */
function systemLanguage() {
  for (const tag of navigator.languages ?? [navigator.language]) {
    const [primary, ...rest] = tag.toLowerCase().split("-");
    if (primary === "en") return null;
    if (primary === "zh")
      return rest.some((part) => ["hant", "tw", "hk", "mo"].includes(part))
        ? "zh-tw"
        : "zh-cn";
    if (primary === "pt") return "pt-br";
    if (primary in MESSAGES) return primary;
  }
  return null;
}

/**
 * Monaco is bundled with Ella rather than fetched from a CDN, so the editor
 * also works on a network with no internet access. Its interface follows
 * the system language rather than Ella's, and is read once, when the editor
 * module first loads.
 */
export function loadMonaco() {
  loading ??= (async () => {
    const language = systemLanguage();
    if (language) await MESSAGES[language]();
    self.MonacoEnvironment = {
      getWorker: (_id, label) =>
        label === "json"
          ? new Worker(new URL("./json.worker.ts", import.meta.url), {
              type: "module",
            })
          : new Worker(new URL("./editor.worker.ts", import.meta.url), {
              type: "module",
            }),
    };
    const monaco = await import("monaco-editor");
    loader.config({ monaco });
    await loader.init();
    return monaco;
  })();
  return loading;
}
