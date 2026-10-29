import type { TreeNode } from './api';

/**
 * Pasted/dropped images are stored in an `attachments/` folder next to the note. This is the
 * single source of truth for that name (uploads and the "hide attachment folders" tree option).
 */
export const ATTACHMENT_DIR_NAME = 'attachments';

const NOTE_RE = /\.(md|markdown|canvas)$/i;

/** True if the folder holds a note or canvas anywhere beneath it. */
function containsNotes(node: TreeNode): boolean {
  for (const c of node.children ?? []) {
    if (c.type === 'file' ? NOTE_RE.test(c.name) : containsNotes(c)) return true;
  }
  return false;
}

/**
 * An auto-created attachment folder that can be hidden from the file tree: named `attachments`
 * (any case) AND free of notes/canvases. The second condition is the safeguard — a real folder
 * a user happens to call "attachments" that holds notes is never hidden.
 */
export function isHiddenAttachmentFolder(node: TreeNode): boolean {
  return (
    node.type === 'folder' &&
    node.name.toLowerCase() === ATTACHMENT_DIR_NAME &&
    !containsNotes(node)
  );
}

/** Children to display: attachment folders are dropped unless the user chose to show them. */
export function displayChildren(children: TreeNode[], showAttachmentFolders: boolean): TreeNode[] {
  return showAttachmentFolders ? children : children.filter((c) => !isHiddenAttachmentFolder(c));
}

/** True if `path` lies inside a folder that is currently hidden by the option. */
export function isInsideHiddenAttachmentFolder(root: TreeNode | null, path: string): boolean {
  if (!root) return false;
  let node: TreeNode | undefined = root;
  const segs = path.split('/');
  segs.pop(); // ancestors only
  for (const seg of segs) {
    node = node?.children?.find((c) => c.type === 'folder' && c.name === seg);
    if (!node) return false;
    if (isHiddenAttachmentFolder(node)) return true;
  }
  return false;
}
