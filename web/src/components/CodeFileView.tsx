import {useEffect,useRef,useState} from 'react';
import {EditorState,Compartment} from '@codemirror/state';
import {EditorView,lineNumbers,drawSelection,keymap} from '@codemirror/view';
import {search,searchKeymap} from '@codemirror/search';
import {syntaxHighlighting,LanguageDescription} from '@codemirror/language';
import {languages} from '@codemirror/language-data';
import {getActiveEditor,setActiveEditor} from '../lib/activeEditor';
import {obsidianHighlightStyle} from '../lib/highlight';
import {api} from '../lib/api';
import {useStore} from '../lib/store';
import type {CodeFileReadResult} from '../lib/codeFiles';

export default function CodeFileView({path,result,language,lineNumbers:showLines,pane='main'}:{path:string;result:CodeFileReadResult|null;language:string;lineNumbers:boolean;pane?:'main'|'split'}){
 const host=useRef<HTMLDivElement>(null);const [note,setNote]=useState('');const [copyStatus,setCopyStatus]=useState('');
 useEffect(()=>{
  setNote('');setCopyStatus('');if(!host.current||result?.kind!=='text')return;
  let live=true;const compartment=new Compartment();
  const view=new EditorView({parent:host.current,state:EditorState.create({doc:result.content,extensions:[EditorState.readOnly.of(true),EditorView.editable.of(false),EditorView.contentAttributes.of({tabindex:'0','aria-label':'Code file contents'}),drawSelection(),...(showLines?[lineNumbers()]:[]),search({top:true}),keymap.of(searchKeymap),syntaxHighlighting(obsidianHighlightStyle),compartment.of([]),EditorView.domEventHandlers({focus:()=>{setActiveEditor(view);}})]})});
  if(!getActiveEditor())setActiveEditor(view);
  if(!result.highlightAllowed)setNote('Highlighting off (large file)');
  else if(language!=='plain'){
   const desc=LanguageDescription.matchLanguageName(languages,language,true);
   if(!desc)setNote('No grammar available — plain text');
   else void desc.load().then(s=>{if(live)view.dispatch({effects:compartment.reconfigure(s)});}).catch(()=>{if(live)setNote('Highlighting unavailable — plain text');});
  }
  return()=>{live=false;if(getActiveEditor()===view)setActiveEditor(null);view.destroy();};
 },[path,result,language,showLines]);
 useEffect(()=>{let pending=false;const refresh=(event:Event)=>{const d=(event as CustomEvent).detail;if(d?.path!==path||pending)return;pending=true;const s=useStore.getState();const read=s.refreshCodeFile(path,pane);void read.catch(()=>s.notify('File changed or is no longer available. Reopen it to retry.')).finally(()=>{pending=false;});};window.addEventListener('wo-fs',refresh);return()=>window.removeEventListener('wo-fs',refresh);},[path,pane]);
 const copy=async()=>{try{if(result?.kind==='text'){await navigator.clipboard.writeText(result.content);setCopyStatus('Copied');}}catch{setCopyStatus('Copy unavailable. Select the text and copy it.');}};
 return <div className="code-file-view">
  <div className="code-file-toolbar"><span>{language} · Read only</span><span className="grow"/><span role="status">{copyStatus||note}</span>{result?.kind==='text'&&<button title="Copy entire file contents to the clipboard" onClick={()=>void copy()}>Copy</button>}</div>
  {result?.kind==='unavailable'?<div className="attachment-card"><p>{result.reason==='too-large'?'File exceeds the 10 MiB preview limit.':result.reason==='binary'?'This file contains binary data.':'This file is not valid UTF-8 text.'}</p><a href={api.downloadUrl(path)}>Download</a></div>:<div className="code-file-editor" ref={host}/>}
 </div>;
}
