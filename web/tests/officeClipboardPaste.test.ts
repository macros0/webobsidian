import {test} from 'node:test';
import assert from 'node:assert/strict';
import {EditorState,EditorSelection} from '@codemirror/state';
import {history,undo} from '@codemirror/commands';
import type {EditorView} from '@codemirror/view';
import {pasteOffice} from '../src/lib/officeClipboard/editor';
import {useStore} from '../src/lib/store';
import {setActiveEditor} from '../src/lib/activeEditor';

function editor() {
  const view={state:EditorState.create({doc:'before SELECT after',selection:EditorSelection.range(7,13),extensions:[history()]}),dom:{isConnected:true},focus(){},dispatch(transaction: Parameters<EditorState['update']>[0]){this.state=this.state.update(transaction).state;}};
  view.dispatch=view.dispatch.bind(view);
  setActiveEditor(view as unknown as EditorView);
  useStore.setState({activePath:'Office.md',notify:()=>{}});
  return view;
}
test('Office paste replaces selection and undo restores whole fragment',async()=>{
  const view=editor();
  await pasteOffice(view as unknown as EditorView,'Office.md','','A\tB\n1\t2',[]);
  assert.ok(view.state.doc.toString().startsWith('before \n\n|  |  |'));
  assert.ok(view.state.doc.toString().endsWith('\n\n after'));
  assert.equal(undo(view as unknown as EditorView),true);
  assert.equal(view.state.doc.toString(),'before SELECT after');
  setActiveEditor(null);
});
test('Office paste cancels when document, selection or active note changes',async()=>{
  for(const change of ['document','selection','path']) {
    const view=editor();let notice='';useStore.setState({notify:message=>{notice=message;}});
    const pending=pasteOffice(view as unknown as EditorView,'Office.md','','A\tB',[]);
    if(change==='document')view.dispatch({changes:{from:0,insert:'edit '}});
    if(change==='selection')view.dispatch({selection:{anchor:0}});
    if(change==='path')useStore.setState({activePath:'Other.md'});
    await pending;
    assert.ok(!view.state.doc.toString().includes('|'));
    assert.ok(notice.includes('cancelled'));
  }
  setActiveEditor(null);
});
