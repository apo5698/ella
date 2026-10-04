"use client";

import { useTheme } from "next-themes";

import { useEffect, useRef, useState } from "react";
import Editor from "@monaco-editor/react";
import { Spinner } from "@/components/ui/spinner";
import { loadMonaco } from "@/lib/monaco/load";

type Monaco = Awaited<ReturnType<typeof loadMonaco>>;

/** One model per editor, so each can carry its own schema. */
let nextModel = 0;

/**
 * A JSON editor that completes, checks and describes the document against
 * `schema` as the user types, as VS Code does.
 */
export default function JsonCodeEditor({
  value,
  schema,
  label,
  loadingLabel,
  disabled,
  onChange,
  onSave,
}: {
  value: string;
  schema: object;
  label: string;
  loadingLabel: string;
  disabled?: boolean;
  onChange: (value: string) => void;
  /** Called on Ctrl+S or Cmd+S. */
  onSave?: () => void;
}) {
  const { resolvedTheme } = useTheme();
  const [monaco, setMonaco] = useState<Monaco | null>(null);
  const [path] = useState(() => `ella-${++nextModel}.json`);
  const save = useRef(onSave);

  useEffect(() => {
    save.current = onSave;
  }, [onSave]);

  useEffect(() => {
    let active = true;
    void loadMonaco().then((loaded) => {
      if (active) setMonaco(loaded);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!monaco) return;
    const uri = monaco.Uri.parse(path).toString();
    const others = (
      monaco.json.jsonDefaults.diagnosticsOptions.schemas ?? []
    ).filter((entry) => entry.uri !== `ella://schema/${path}`);
    monaco.json.jsonDefaults.setDiagnosticsOptions({
      validate: true,
      allowComments: false,
      trailingCommas: "error",
      enableSchemaRequest: false,
      schemas: [
        ...others,
        { uri: `ella://schema/${path}`, fileMatch: [uri], schema },
      ],
    });
  }, [monaco, path, schema]);

  if (!monaco)
    return (
      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <Spinner />
        {loadingLabel}
      </p>
    );

  return (
    <div className="overflow-hidden rounded-md border border-input bg-input/20 transition-colors focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/30 dark:bg-input/30">
      <Editor
        path={path}
        language="json"
        value={value}
        height="22rem"
        theme={resolvedTheme === "dark" ? "ella-dark" : "ella-light"}
        beforeMount={(instance) => {
          // Transparent, so the editor takes the field colors around it.
          for (const [name, base] of [
            ["ella-light", "vs"],
            ["ella-dark", "vs-dark"],
          ] as const)
            instance.editor.defineTheme(name, {
              base,
              inherit: true,
              rules: [],
              colors: {
                "editor.background": "#00000000",
                "editor.gutter.background": "#00000000",
              },
            });
        }}
        onMount={(editor, instance) => {
          editor.addCommand(
            instance.KeyMod.CtrlCmd | instance.KeyCode.KeyS,
            () => save.current?.(),
          );
        }}
        onChange={(next) => onChange(next ?? "")}
        options={{
          ariaLabel: label,
          readOnly: disabled,
          minimap: { enabled: false },
          fontSize: 12,
          lineNumbersMinChars: 3,
          tabSize: 2,
          scrollBeyondLastLine: false,
          automaticLayout: true,
          fixedOverflowWidgets: true,
          wordWrap: "on",
          quickSuggestions: { strings: true, other: true, comments: false },
          renderLineHighlight: "none",
          padding: { top: 8, bottom: 8 },
        }}
      />
    </div>
  );
}
