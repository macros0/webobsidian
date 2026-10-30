import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { build } from 'esbuild';

test('real editor: Tab, Shift-Tab, visible folding and undo work in live and source modes',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'webo-structure-'));
 try {
  await build({stdin:{resolveDir:fileURLToPath(new URL('..',import.meta.url)),loader:'tsx',contents:`
   import React from 'react';import {createRoot} from 'react-dom/client';
   import Editor from './src/components/Editor';import {useStore} from './src/lib/store';
   import {api} from './src/lib/api';import {getActiveEditor} from './src/lib/activeEditor';
   import {foldCode,unfoldAll,foldedRanges} from '@codemirror/language';
   import {undo} from '@codemirror/commands';import './src/styles/obsidian.css';
   api.tags=async()=>({tags:[]});api.propertyTypes=async()=>({types:{}});
   const wait=()=>new Promise(r=>setTimeout(r,100));const check=(v,m)=>{if(!v)throw Error(m)};
   const fence=String.fromCharCode(96).repeat(3);
   const doc=['# Title','body','','- parent','\\t- child','\\t\\t- grandchild','- sibling','','plain','\\tchild','','code',fence+'abap','parent','\\tchild',fence,'','# Next','end'].join('\\n');
   let root;
   window.prepare=async mode=>{
    root?.unmount();document.body.className='theme-dark';document.body.innerHTML='<div class="cm-s-obsidian" id="root"></div>';
    useStore.setState({activePath:mode+'.md',content:doc,dirty:false,viewMode:mode,showInlineTitle:false,locked:false,save:async()=>{}});
    root=createRoot(document.querySelector('#root'));root.render(<Editor/>);await wait();await wait();
    const v=getActiveEditor();check(v,'editor mounted');
    check(v.dom.querySelector('.cm-foldGutter'),'fold controls visible');
    check(v.dom.querySelector('.cm-code-indent-guide'),'code indentation guides visible');
    v.dispatch({selection:{anchor:v.state.doc.line(4).from}});v.focus();await wait();
   };
   window.foldParent=async()=>{
    const v=getActiveEditor();check(foldCode(v),'parent folds');await wait();
    check(foldedRanges(v.state).size===1,'parent fold retained');check(v.state.doc.toString()===doc,'fold does not edit Markdown');
    check(v.dom.querySelector('.cm-foldPlaceholder'),'collapsed placeholder visible');
   };
   window.indented=async()=>{
    const v=getActiveEditor();await wait();check(v.state.doc.line(4).text==='\\t- parent','Tab indents parent');
    check(v.state.doc.line(5).text==='\\t\\t- child','Tab indents hidden child');
    check(foldedRanges(v.state).size===1,'Tab preserves fold');
   };
   window.outdented=async()=>{
    const v=getActiveEditor();await wait();check(v.state.doc.toString()===doc,'Shift-Tab restores whole subtree');
    undo(v);check(v.state.doc.line(5).text==='\\t\\t- child','undo reverts one complete outdent');undo(v);
    check(v.state.doc.toString()===doc,'undo restores original');unfoldAll(v);await wait();
    const heading=v.dom.querySelector('.cm-foldGutter .cm-gutterElement[title]')||Array.from(v.dom.querySelectorAll('.cm-foldGutter .cm-gutterElement')).find(e=>e.textContent.trim()&&getComputedStyle(e).visibility!=='hidden');
    check(heading,'clickable fold arrow');const r=heading.getBoundingClientRect();
    heading.dispatchEvent(new MouseEvent('click',{bubbles:true,clientX:r.left+3,clientY:r.top+3,button:0}));await wait();
    check(foldedRanges(v.state).size>0,'arrow click folds section');unfoldAll(v);await wait();
    check(v.state.doc.toString()===doc,'click folding does not change text');
   };
  `},bundle:true,format:'iife',platform:'browser',loader:{'.woff2':'file','.woff':'file','.ttf':'file'},define:{'import.meta.env.DEV':'false','import.meta.url':JSON.stringify('file:///fixture.js')},outfile:join(dir,'fixture.js'),logLevel:'silent'});
  await writeFile(join(dir,'index.html'),'<meta charset="utf-8"><link rel="stylesheet" href="fixture.css"><script src="fixture.js"></script>');
  await writeFile(join(dir,'runner.cjs'),`const {app,BrowserWindow}=require('electron');app.whenReady().then(async()=>{
   const w=new BrowserWindow({show:false,width:1100,height:1000,webPreferences:{backgroundThrottling:false}});w.webContents.on('console-message',(_event,level,message)=>{if(level>=2)console.error(message)});await w.loadFile(${JSON.stringify(join(dir,'index.html'))});
   const evaluate=async code=>{const result=await w.webContents.executeJavaScript('(async()=>{try{return await '+code+'}catch(e){return {failure:e.stack||String(e)}}})()');if(result?.failure)throw Error(result.failure);};
   for(const mode of ['live','source']){
    await evaluate('window.prepare('+JSON.stringify(mode)+')');await evaluate('window.foldParent()');
    w.webContents.sendInputEvent({type:'keyDown',keyCode:'Tab'});w.webContents.sendInputEvent({type:'keyUp',keyCode:'Tab'});
    await evaluate('window.indented()');
    w.webContents.sendInputEvent({type:'keyDown',keyCode:'Tab',modifiers:['shift']});w.webContents.sendInputEvent({type:'keyUp',keyCode:'Tab',modifiers:['shift']});
    await evaluate('window.outdented()');
   }console.log('STRUCTURE_PASS');w.destroy();app.quit();}).catch(e=>{console.error(e);app.exit(1)});`);
  const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
  const {stdout}=await promisify(execFile)(createRequire(import.meta.url)('electron'),[...(process.platform==='linux'?['--ozone-platform=headless']:[]),join(dir,'runner.cjs')],{env,windowsHide:true,timeout:60000});
  assert.match(stdout,/STRUCTURE_PASS/);
 }finally{await rm(dir,{recursive:true,force:true});}
});
