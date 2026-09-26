import { mkdir, readdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { AppError, errorDetails } from "@/lib/appError";
import { importDownloadedVideo } from "@/lib/utilities/downloadImport";
import type {
  ArchiveNode,
  DownloadInspection,
  DownloadProgressReporter,
  RetainedDownload,
} from "@/lib/utilities/downloadTypes";
import {
  discardWorkspace,
  isWorkspace,
} from "@/lib/utilities/downloadWorkspace";
import {
  detectArchiveType,
  extractArchiveSafely,
} from "@/lib/utilities/safeArchive";
import { detectVideoExtension } from "@/lib/utilities/videoSniff";

/** Archives inside archives are opened this many levels deep. */
const MAX_DEPTH = 4;
/** Entries listed before the tree is cut short. */
const MAX_NODES = 5000;

type Walk = {
  workspace: string;
  root: string;
  opened: number;
  nodes: number;
  truncated: boolean;
  signal?: AbortSignal;
};

const relative = (walk: Walk, file: string) =>
  path.relative(walk.workspace, file).split(path.sep).join("/");

async function describeFile(
  walk: Walk,
  file: string,
  depth: number,
): Promise<ArchiveNode> {
  const { size } = await stat(file);
  const node = {
    name: path.basename(file),
    path: relative(walk, file),
    size,
  };
  const type = await detectArchiveType(file);
  if (!type) {
    return { ...node, kind: "file", video: await detectVideoExtension(file) };
  }
  if (depth >= MAX_DEPTH) return { ...node, kind: "archive", video: null };
  const destination = path.join(walk.root, String(++walk.opened));
  try {
    await extractArchiveSafely(file, destination, { signal: walk.signal });
  } catch (error) {
    if (walk.signal?.aborted) throw error;
    return {
      ...node,
      kind: "archive",
      video: null,
      error: errorDetails(error).code,
    };
  }
  return {
    ...node,
    kind: "archive",
    video: null,
    children: await describeDirectory(walk, destination, depth + 1),
  };
}

async function describeDirectory(
  walk: Walk,
  directory: string,
  depth: number,
): Promise<ArchiveNode[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  entries.sort(
    (a, b) =>
      Number(b.isDirectory()) - Number(a.isDirectory()) ||
      a.name.localeCompare(b.name),
  );
  const nodes: ArchiveNode[] = [];
  for (const entry of entries) {
    if (walk.nodes >= MAX_NODES) {
      walk.truncated = true;
      break;
    }
    walk.nodes += 1;
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      nodes.push({
        name: entry.name,
        path: relative(walk, file),
        kind: "directory",
        size: 0,
        video: null,
        children: await describeDirectory(walk, file, depth),
      });
    } else if (entry.isFile()) {
      nodes.push(await describeFile(walk, file, depth));
    }
  }
  return nodes;
}

/**
 * Opens every archive among `files`, and every archive inside those, into
 * `<workspace>/inspect`, and describes what is there. The tree is what the
 * user chooses the video from when the layout was not the expected one.
 */
export async function inspectDownload(
  workspace: string,
  files: string[],
  signal?: AbortSignal,
): Promise<DownloadInspection> {
  const root = path.join(workspace, "inspect");
  await rm(root, { recursive: true, force: true });
  await mkdir(root);
  const walk: Walk = {
    workspace,
    root,
    opened: 0,
    nodes: 0,
    truncated: false,
    signal,
  };
  const tree: ArchiveNode[] = [];
  for (const file of files) {
    walk.nodes += 1;
    tree.push(await describeFile(walk, file, 0));
  }
  return { tree, truncated: walk.truncated };
}

export function findNode(
  tree: ArchiveNode[],
  nodePath: string,
): ArchiveNode | undefined {
  for (const node of tree) {
    if (node.path === nodePath) return node;
    const found = node.children && findNode(node.children, nodePath);
    if (found) return found;
  }
  return undefined;
}

/**
 * A download that failed with its files kept. The task runner stores the
 * retained files with the failure, so the user can inspect them and choose.
 */
export class RetainedDownloadError extends AppError {
  readonly retained: RetainedDownload;

  constructor(cause: AppError, retained: RetainedDownload) {
    super(cause.code, cause.values, { cause });
    this.name = "RetainedDownloadError";
    this.retained = retained;
  }
}

/**
 * Imports the file the user chose from a retained download. A refusal keeps
 * the files, so another file can be chosen; success removes them.
 */
export async function importSelectedFile(
  name: string,
  selection: RetainedDownload & { path: string },
  onProgress: DownloadProgressReporter,
) {
  const { path: nodePath, ...retained } = selection;
  const node = findNode(retained.tree, nodePath);
  const file = path.resolve(retained.workspace, nodePath);
  try {
    if (
      !isWorkspace(retained.workspace) ||
      !node ||
      node.kind !== "file" ||
      !file.startsWith(path.resolve(retained.workspace) + path.sep)
    )
      throw new AppError("downloadSelectionInvalid");
    const extension = await detectVideoExtension(file).catch(() => null);
    if (!extension) throw new AppError("downloadNotVideo");
    const result = await importDownloadedVideo(
      file,
      name,
      () => onProgress({ phase: "importing" }),
      extension,
    );
    await discardWorkspace(retained.workspace);
    return result;
  } catch (error) {
    if (error instanceof AppError)
      throw new RetainedDownloadError(error, retained);
    throw error;
  }
}
