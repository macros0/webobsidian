import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EditorState } from '@codemirror/state';
import { markdown } from '@codemirror/lang-markdown';
import { foldable, foldEffect, foldedRanges } from '@codemirror/language';
import { indentFold, editorStructure, tabIndent, outdentOutline } from '../src/lib/editorStructure';

const state = (doc: string, anchor = 0) => EditorState.create({doc, selection:{anchor}, extensions:[markdown(), editorStructure]});
test('indent folding stops at siblings and keeps intervening blank lines', () => {
  const s=state('parent\n\tchild\n\n\t\tgrandchild\nsibling');
  assert.deepEqual(indentFold(s,0,s.doc.line(1).to),{from:6,to:s.doc.line(4).to});
  assert.deepEqual(indentFold(s,s.doc.line(2).from,s.doc.line(2).to),{from:s.doc.line(2).to,to:s.doc.line(4).to});
  assert.equal(indentFold(s,s.doc.line(5).from,s.doc.line(5).to),null);
});
test('changing indent on a folded parent moves its hidden descendants and preserves the fold',()=>{
  let s=state('- parent\n\t- child\nnext');
  s=s.update({effects:foldEffect.of({from:8,to:s.doc.line(2).to})}).state;
  const target={get state(){return s;},dispatch:(tr:ReturnType<EditorState['update']>)=>{s=tr.state;}};
  tabIndent(target);assert.equal(s.doc.toString(),'\t- parent\n\t\t- child\nnext');
  assert.equal(foldedRanges(s).size,1);
  outdentOutline(target);assert.equal(s.doc.toString(),'- parent\n\t- child\nnext');
  assert.equal(foldedRanges(s).size,1);
});
test('tabs use four columns and spaces may form nested text too',()=>{
  const s=state('parent\n    child\n\t\tgrandchild\n    sibling\nnext');
  assert.equal(s.tabSize,4);
  assert.equal(indentFold(s,s.doc.line(2).from,s.doc.line(2).to)?.to,s.doc.line(3).to);
});
test('Markdown headings and whole fenced code blocks fold, code interiors do not become outlines',()=>{
  const s=state('# Title\nbody\n## Child\nchild body\n# Next\n```abap\nparent\n\tchild\n```');
  assert.equal(foldable(s,0,s.doc.line(1).to)?.to,s.doc.line(4).to);
  assert.ok(foldable(s,s.doc.line(6).from,s.doc.line(6).to));
  assert.equal(indentFold(s,s.doc.line(7).from,s.doc.line(7).to),null);
});
test('Tab inserts a tab at a text caret and indents a list item; readonly text cannot change',()=>{
  let s=state('ab',1);
  const target=()=>({state:s,dispatch:(tr:ReturnType<EditorState['update']>)=>{s=tr.state;}});
  tabIndent(target());assert.equal(s.doc.toString(),'a\tb');
  s=state('- parent\n- child',16);
  tabIndent(target());assert.equal(s.doc.toString(),'- parent\n\t- child');
  s=EditorState.create({doc:'text',extensions:[editorStructure,EditorState.readOnly.of(true)]});
  assert.equal(tabIndent(target()),false);assert.equal(s.doc.toString(),'text');
});
