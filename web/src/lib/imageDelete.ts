import { api } from './api';
import { useStore } from './store';
import { confirmDialog } from './confirm';
import type { ImageDeleteRequest } from './livePreview';

export async function deleteEmbeddedImage({ target, view: v, remove }: ImageDeleteRequest): Promise<void> {
  const initial = useStore.getState();
  const note = initial.activePath ?? '';
  const originalDoc = v.state.doc;
  // Async resolution and confirmation can outlive navigation or a lock-mode change.
  const mayEdit = () => {
    const current = useStore.getState();
    return !!note && current.activePath === note && !current.locked && current.viewMode !== 'reading'
      && !v.state.readOnly && v.state.doc.eq(originalDoc);
  };
  if (!mayEdit()) return;
  const { notify, loadTree } = useStore.getState();
  const file = target ? await api.resolveAttachment(target, note).then((r) => r.path).catch(() => null) : null;
  if (!mayEdit()) return;
  if (!file) {
    remove(); // web URL / missing file → only the reference can go
    return;
  }
  const base = (file.split('/').pop() ?? file).toLowerCase();
  const refs = (await api.references(file, note).catch(() => ({ references: [] as string[] }))).references;
  if (!mayEdit()) return;
  // Other embeds of the same file left in THIS note (the one being removed counts once).
  // The file name can appear raw or %20-encoded; count each distinct spelling once —
  // names without spaces have identical spellings and must not be counted twice.
  const doc = v.state.doc.toString().toLowerCase();
  const spellings = Array.from(new Set([base, base.replace(/ /g, '%20')]));
  const mentions = spellings.reduce((n, s) => n + (doc.split(s).length - 1), 0);
  const inThisNote = mentions > 1;
  // Native confirm() is blocked or silently auto-cancelled in embedded browsers (the click
  // then does nothing), so use the in-app dialog.
  if (refs.length || inThisNote) {
    const where = refs.length
      ? `${refs.length} other note${refs.length > 1 ? 's' : ''} (${refs.slice(0, 3).join(', ')}${refs.length > 3 ? ', …' : ''})`
      : 'elsewhere in this note';
    const ok = await confirmDialog(`"${file}" is also used in ${where}.`, {
      detail: 'Remove the image from this note only? The file will be kept.',
      confirmLabel: 'Remove from this note',
    });
    if (ok && mayEdit()) remove();
    return;
  }
  const ok = await confirmDialog(`Remove this image and permanently delete "${file}"?`, {
    detail: 'This cannot be undone: the file is deleted immediately, not moved to the trash.',
    confirmLabel: 'Delete',
    danger: true,
  });
  if (!ok || !mayEdit()) return;
  remove();
  try {
    await useStore.getState().deletePath(file, true);
    await loadTree();
    notify(`Deleted ${file}`);
  } catch (e: any) {
    notify(e.message);
  }
}
