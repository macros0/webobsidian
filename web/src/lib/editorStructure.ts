import { EditorState, EditorSelection, Prec, countColumn, type StateCommand } from '@codemirror/state';
import { Decoration, EditorView, ViewPlugin, keymap, type DecorationSet } from '@codemirror/view';
import { indentLess, indentMore, insertTab } from '@codemirror/commands';
import { foldGutter, foldKeymap, foldService, foldedRanges, indentUnit, syntaxTree } from '@codemirror/language';

function shiftOutline(target: Parameters<StateCommand>[0], less: boolean): boolean {
  const {state}=target;
  if(state.readOnly)return false;
  let expanded=false;
  const ranges=state.selection.ranges.map(range=>{
    let end=range.to;
    const last=state.doc.lineAt(range.to);
    const lineEnd=!range.empty&&range.to===last.from?range.to-1:last.to;
    foldedRanges(state).between(state.doc.lineAt(range.from).from,lineEnd,(from,to)=>{
      if(state.doc.lineAt(from).from<=lineEnd){end=Math.max(end,to);expanded=true;}
    });
    return EditorSelection.range(range.from,end);
  });
  const command=less?indentLess:indentMore;
  if(!expanded)return command(target);
  const selected=state.update({selection:EditorSelection.create(ranges)}).state;
  return command({state:selected,dispatch:tr=>target.dispatch(state.update({
    changes:tr.changes,selection:state.selection.map(tr.changes),userEvent:'indent',scrollIntoView:true,
  }))});
}
export const outdentOutline: StateCommand = target=>shiftOutline(target,true);

function codeBlockAt(state: EditorState, pos: number) {
  const line=state.doc.lineAt(pos);
  const contentStart=line.from+(line.text.match(/^[\t ]*/)?.[0].length??0);
  for(let node=syntaxTree(state).resolve(contentStart,1);node;node=node.parent!) {
    if(node.name==='FencedCode'||node.name==='CodeBlock')return node;
  }
  return null;
}
const inCode=(state:EditorState,pos:number)=>codeBlockAt(state,pos)!==null;

/** Fold indentation both in prose and code, bounded by the enclosing code block. */
export function indentFold(state: EditorState, start: number, end: number): {from:number;to:number}|null {
  const line=state.doc.lineAt(start);
  const code=codeBlockAt(state,start);
  if(!line.text.trim()||(!code&&/^\s*#{1,6}\s/.test(line.text)))return null;
  let lastLine=state.doc.lines;
  if(code){
    lastLine=state.doc.lineAt(code.to).number;
    if(code.name==='FencedCode'){
      const marks=code.getChildren('CodeMark');
      if(marks.some(mark=>state.doc.lineAt(mark.from).number===line.number))return null;
      const closing=marks.length>1?marks[marks.length-1]:null;
      if(closing)lastLine=state.doc.lineAt(closing.from).number-1;
    }
  }
  const depth=countColumn(line.text.match(/^[\t ]*/)?.[0]??'',state.tabSize);
  let to=end;
  for(let n=line.number+1;n<=lastLine;n++) {
    const child=state.doc.line(n);
    if(!child.text.trim())continue;
    const indent=countColumn(child.text.match(/^[\t ]*/)?.[0]??'',state.tabSize);
    if(indent<=depth)break;
    to=child.to;
  }
  return to>end?{from:end,to}:null;
}

/** A caret inserts a literal tab; list items and selections move by one level. */
export const tabIndent: StateCommand = target => {
  if(target.state.readOnly)return false;
  const list=target.state.selection.ranges.some(range=>{
    const line=target.state.doc.lineAt(range.head);
    return !inCode(target.state,line.from)&&/^[\t ]*(?:[-*+]|\d+[.)])\s/.test(line.text);
  });
  let folded=false;
  for(const range of target.state.selection.ranges)foldedRanges(target.state).between(target.state.doc.lineAt(range.head).from,target.state.doc.lineAt(range.head).to,()=>{folded=true;});
  return list||folded||target.state.selection.ranges.some(r=>!r.empty)?shiftOutline(target,false):insertTab(target);
};

function guides(view: EditorView): DecorationSet {
  const ranges=[];
  const seen=new Set<number>();
  for(const visible of view.visibleRanges) {
    for(let n=view.state.doc.lineAt(visible.from).number;n<=view.state.doc.lines;n++) {
      const line=view.state.doc.line(n);
      if(line.from>visible.to)break;
      if(seen.has(n))continue;seen.add(n);
      // Live Preview already owns guides on lists and indented code. Add the
      // guides inside fenced blocks, where language syntax must remain literal.
      const ws=line.text.match(/^[\t ]+/)?.[0];
      let fenced=false;
      for(let node=syntaxTree(view.state).resolve(line.from,1);node;node=node.parent!)if(node.name==='FencedCode')fenced=true;
      if(ws&&fenced)ranges.push(Decoration.mark({class:'cm-code-indent-guide'}).range(line.from,line.from+ws.length));
    }
  }
  return Decoration.set(ranges,true);
}
const codeGuides=ViewPlugin.fromClass(class {
  decorations: DecorationSet;
  constructor(view: EditorView){this.decorations=guides(view);}
  update(update: import('@codemirror/view').ViewUpdate){
    if(update.docChanged||update.viewportChanged||syntaxTree(update.startState)!==syntaxTree(update.state))this.decorations=guides(update.view);
  }
},{decorations:plugin=>plugin.decorations});

export const editorStructure = [
  EditorState.tabSize.of(4),indentUnit.of('\t'),
  Prec.high(foldService.of(indentFold)),
  foldGutter({openText:'⌄',closedText:'›'}),
  Prec.high(keymap.of([{key:'Tab',run:tabIndent,shift:outdentOutline},...foldKeymap])),
  codeGuides,
];
