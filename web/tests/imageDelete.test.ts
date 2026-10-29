import assert from 'node:assert/strict';
import { afterEach, beforeEach, mock, test } from 'node:test';
import { EditorState } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import { api } from '../src/lib/api';
import { useStore } from '../src/lib/store';
import { useConfirm } from '../src/lib/confirm';
import { deleteEmbeddedImage } from '../src/lib/imageDelete';

beforeEach(() => {
  useStore.setState(useStore.getInitialState(), true);
  useStore.setState({ activePath: 'docs/note.md', viewMode: 'live', locked: false });
  mock.method(api, 'resolveAttachment', async () => ({ path: 'docs/attachments/image.png' }));
  mock.method(api, 'references', async () => ({ references: [] }));
  mock.method(api, 'remove', async () => ({ ok: true as const }));
  useStore.setState({ loadTree: async () => {}, notify: () => {} });
});
afterEach(() => {
  useConfirm.getState().req?.resolve(false);
  mock.restoreAll();
});
const request = (readonly = false) => ({
  target: 'attachments/image.png',
  view: { state: EditorState.create({ doc: '![[attachments/image.png]]', extensions: EditorState.readOnly.of(readonly) }) } as EditorView,
  remove: mock.fn(),
});
const settleDialog = async () => {
  for (let i = 0; i < 10 && !useConfirm.getState().req; i++) await Promise.resolve();
};

test('locked note cannot delete its unlocked attachment', async () => {
  useStore.setState({ locked: true });
  const r = request();
  const operation = deleteEmbeddedImage(r);
  await settleDialog();
  useConfirm.getState().req?.resolve(true);
  await operation;
  assert.equal(r.remove.mock.callCount(), 0);
  assert.equal((api.remove as unknown as ReturnType<typeof mock.fn>).mock.callCount(), 0);
});

test('reading view cannot delete an image programmatically', async () => {
  useStore.setState({ viewMode: 'reading' });
  const r = request(true);
  const operation = deleteEmbeddedImage(r);
  await settleDialog();
  useConfirm.getState().req?.resolve(true);
  await operation;
  assert.equal(r.remove.mock.callCount(), 0);
});

test('locking or navigating during the confirmation cancels image deletion', async () => {
  for (const change of [{ locked: true }, { activePath: 'other.md' }]) {
    useStore.setState({ locked: false, activePath: 'docs/note.md' });
    const r = request();
    const operation = deleteEmbeddedImage(r);
    await settleDialog();
    assert.ok(useConfirm.getState().req);
    useStore.setState(change);
    useConfirm.getState().req!.resolve(true);
    await operation;
    assert.equal(r.remove.mock.callCount(), 0);
  }
});

test('editable note still supports confirmed image removal', async () => {
  const r = request();
  const operation = deleteEmbeddedImage(r);
  await settleDialog();
  useConfirm.getState().req!.resolve(true);
  await operation;
  assert.equal(r.remove.mock.callCount(), 1);
});
