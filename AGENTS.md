<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Standard UI components

- Do not manually change the default styles of shadcn components in `components/ui`.
- Add or refresh standard components with the shadcn CLI, using the project's configured style.
- Compose standard components in business components; use their variants and sizes before adding custom presentation. Keep standard UI source unchanged. In business components, use semantic hierarchy: primary content stays prominent, while secondary metadata and descriptions use `text-xs` and muted colors where appropriate.
