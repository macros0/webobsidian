import {EditorView} from '@codemirror/view';
import {syntaxTree} from '@codemirror/language';
import {isolateHistory} from '@codemirror/commands';
import {importOffice} from './import';
import {api} from '../api';
import {getVaultPreferences} from '../vaultPreferences';
import {formatInternalLink} from '../vaultLinks';
import {treeFilePaths} from '../tree';
import {useStore} from '../store';
import {getActiveEditor} from '../activeEditor';
import {t} from '../i18n/runtime';

export const officePaste = EditorView.domEventHandlers({
  paste(event, view) {
    if (event.defaultPrevented || view.state.readOnly || !event.clipboardData) return false;
    const path = useStore.getState().activePath;
    if (!path || !/\.(md|markdown)$/i.test(path)) return false;
    let node = syntaxTree(view.state).resolveInner(view.state.selection.main.from, -1);
    for (; node.parent; node = node.parent) if (/Code|HTMLBlock/.test(node.name)) return false;
    const html = event.clipboardData.getData('text/html');
    const plain = event.clipboardData.getData('text/plain');
    if (!html && !plain.includes('\t')) return false;
    // Claim only supported structured HTML or a tabular plain text range.
    if (html && !/<(?:p|div|h[1-6]|table|ul|ol|li|b|strong|i|em|a|img|br|pre|blockquote)\b/i.test(html)) return false;
    event.preventDefault();
    event.stopPropagation();
    const files = Array.from(event.clipboardData.files).filter(file => file.type.startsWith('image/'));
    void pasteOffice(view, path, html, plain, files);
    return true;
  },
});

export async function pasteOffice(view: EditorView, path: string, html: string, plain: string, files: File[]): Promise<void> {
  const doc = view.state.doc, selection = view.state.selection;
  const uploaded: string[] = [];
  const current = () => view.dom.isConnected && getActiveEditor() === view && !view.state.readOnly && useStore.getState().activePath === path && view.state.doc === doc && view.state.selection.eq(selection);
  const notify = useStore.getState().notify;
  try {
    const converted = await importOffice(html, plain, files, async file => {
      if (!current()) throw Error('Document changed');
      const {values: preferences} = await getVaultPreferences();
      if (!current()) throw Error('Document changed');
      const result = await api.upload(file, undefined, path);
      uploaded.push(result.path);
      return formatInternalLink({sourcePath:path,targetPath:result.path,embed:true,preferences,knownPaths:treeFilePaths(useStore.getState().tree)});
    }, t('office.image-unavailable'));
    if (!current()) { notify(t('office.document-changed') + (uploaded.length ? '\n' + uploaded.join('\n') : '')); return; }
    const {from,to} = selection.main;
    let insert = converted ?? plain;
    if (converted && /^(?:\| |#{1,6} |[-*] |\d+\. |>|````)/m.test(converted)) {
      const before=doc.sliceString(0,from),after=doc.sliceString(to);
      if(before)insert='\n'.repeat(Math.max(0,2-(before.match(/\n*$/)?.[0].length??0)))+insert;
      if(after)insert+='\n'.repeat(Math.max(0,2-(after.match(/^\n*/)?.[0].length??0)));
    }
    view.dispatch({changes:{from,to,insert},selection:{anchor:from + insert.length},annotations:isolateHistory.of('full'),userEvent:'input.paste'});
    if (insert.includes(t('office.image-unavailable'))) notify(t('office.image-unavailable'));
  } catch { notify(t('office.paste-failed')); }
}
