import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {build} from 'esbuild';

test('embedded notes expose an accessible open button in live, reading and HTML preview',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'webo-note-embed-'));
 try{
  await build({stdin:{resolveDir:fileURLToPath(new URL('..',import.meta.url)),loader:'tsx',contents:`
   import React from 'react';import {createRoot} from 'react-dom/client';
   import Editor from './src/components/Editor';import Preview from './src/components/Preview';
   import {useStore} from './src/lib/store';import {api} from './src/lib/api';
   import './src/styles/obsidian.css';
   api.tags=async()=>({tags:[]});api.propertyTypes=async()=>({types:{}});
   api.resolve=async target=>({path:target.endsWith('.md')?target:'Lab/'+target.split('#')[0]+'.md'});
   api.read=async path=>({content:path==='Lab/Parent.md'?'![[#Section]]\\n\\n# Section\\nNested note body':'# Section\\nEmbedded note body',version:'fixture'});
   const root=createRoot(document.querySelector('#root'));
   const wait=()=>new Promise(r=>setTimeout(r,60));
   const check=(ok,msg)=>{if(!ok)throw Error(msg)};
   const until=async(fn,msg)=>{for(let i=0;i<60&&!fn();i++)await wait();check(fn(),msg)};
   const source='# Host\\n\\n![[Opencode]]\\n\\n![[Other#Section]]';
   let opened=[];
   const open=async(target,kind)=>{opened.push([target,kind])};
   window.run=async()=>{
    for(const mode of ['live','reading','preview']){
     useStore.setState({activePath:'Host.md',content:source,viewMode:mode==='preview'?'reading':mode,showInlineTitle:false,locked:false,dirty:false,save:async()=>{},openWikilink:open});
     root.render(mode==='preview'?<Preview/>:<Editor/>);
     await until(()=>document.body.textContent.includes('Embedded note body'),'note bodies loaded');
     const buttons=[...document.querySelectorAll('button[aria-label="Open embedded note"]')];
     check(buttons.length===2,mode+': each embedded note has its open button');
     for(const button of buttons){
      const css=getComputedStyle(button),rect=button.getBoundingClientRect();
      check(css.visibility==='visible'&&Number(css.opacity)>0&&rect.width>=20&&rect.height>=20,mode+': button visible without hover');
      check(button.tabIndex===0&&button.type==='button',mode+': native keyboard button');
     }
     opened=[];buttons[1].click();await wait();
     check(JSON.stringify(opened)===JSON.stringify([[mode==='preview'?'Lab/Other.md#Section':'Other#Section','wiki']]),mode+': opens the clicked fragment exactly once');
     opened=[];buttons[0].click();await wait();
     check(JSON.stringify(opened)===JSON.stringify([[mode==='preview'?'Lab/Opencode.md':'Opencode','wiki']]),mode+': opens the correct note exactly once');
     check(useStore.getState().content===source,mode+': opening preserves source');
     root.render(<div/>);await wait();
    }
    for(const mode of ['live','reading','preview']){
     useStore.setState({activePath:'Host.md',content:'# Host\\n\\n![[Opencode.md]]',viewMode:mode==='preview'?'reading':mode,openWikilink:open});
     root.render(mode==='preview'?<Preview/>:<Editor/>);
     await until(()=>document.body.textContent.includes('Embedded note body'),mode+': explicit .md embeds note content');
     check(document.querySelectorAll('button[aria-label="Open embedded note"]').length===1,mode+': .md embed has open button');
     root.render(<div/>);await wait();
    }
    for(const mode of ['live','reading','preview']){
     useStore.setState({activePath:'Host.md',content:'# Host\\n\\n![[Parent]]',viewMode:mode==='preview'?'reading':mode,openWikilink:open});
     root.render(mode==='preview'?<Preview/>:<Editor/>);
     await until(()=>document.querySelectorAll('button[aria-label="Open embedded note"]').length===2,'nested note buttons mounted');
     opened=[];document.querySelectorAll('button[aria-label="Open embedded note"]')[1].click();await wait();
     check(JSON.stringify(opened)===JSON.stringify([['Lab/Parent.md#Section','wiki']]),mode+': nested local fragment opens its own source note');
     root.render(<div/>);await wait();
    }
    useStore.setState({activePath:'Host.md',content:source,viewMode:'live',openWikilink:open});root.render(<Editor/>);
    await until(()=>document.querySelector('button[aria-label="Open embedded note"]'),'keyboard button mounted');
    opened=[];document.querySelector('button[aria-label="Open embedded note"]').focus();
    window.verifyKeyboard=()=>{check(JSON.stringify(opened)===JSON.stringify([['Opencode','wiki']]),'Enter opens focused embed once: '+JSON.stringify({opened,focus:document.activeElement?.outerHTML?.slice(0,220),content:useStore.getState().content}));check(useStore.getState().content===source,'keyboard action preserves source')};
    return 'READY';
   };
  `},bundle:true,format:'iife',platform:'browser',tsconfigRaw:{compilerOptions:{useDefineForClassFields:false,jsx:'react-jsx'}},
   loader:{'.woff2':'file','.woff':'file','.ttf':'file'},define:{'import.meta.env.DEV':'false'},outfile:join(dir,'fixture.js'),logLevel:'silent'});
  await writeFile(join(dir,'index.html'),'<meta charset="utf-8"><link rel="stylesheet" href="fixture.css"><body class="theme-dark"><div id="root" style="width:600px;height:1000px"></div><script src="fixture.js"></script>');
  await writeFile(join(dir,'runner.cjs'),`
   const {app,BrowserWindow}=require('electron');
   app.setPath('userData',${JSON.stringify(join(dir,'profile'))});
   app.whenReady().then(async()=>{
    const win=new BrowserWindow({show:false,width:800,height:1200,webPreferences:{backgroundThrottling:false}});
    win.webContents.on('console-message',(_e,_level,message)=>{if(message.includes('crashed'))console.error(message)});
    await win.loadFile(${JSON.stringify(join(dir,'index.html'))});
    win.webContents.focus();
    await win.webContents.executeJavaScript('window.run()');
    win.webContents.sendInputEvent({type:'keyDown',keyCode:'Enter'});win.webContents.sendInputEvent({type:'char',keyCode:String.fromCharCode(13)});win.webContents.sendInputEvent({type:'keyUp',keyCode:'Enter'});
    await win.webContents.executeJavaScript('new Promise(r=>setTimeout(r,100)).then(()=>window.verifyKeyboard())');
    console.log('NOTE_EMBED_PASS');win.destroy();app.quit();
   }).catch(e=>{console.error(e);app.exit(1)});
  `);
  const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
  const {stdout}=await promisify(execFile)(createRequire(import.meta.url)('electron'),[...(process.platform==='linux'?['--ozone-platform=headless']:[]),join(dir,'runner.cjs')],{env,windowsHide:true,timeout:60_000});
  assert.match(stdout,/NOTE_EMBED_PASS/);
 }finally{
  assert.ok(dir.startsWith(join(tmpdir(),'webo-note-embed-')));await rm(dir,{recursive:true,force:true});
 }
});
