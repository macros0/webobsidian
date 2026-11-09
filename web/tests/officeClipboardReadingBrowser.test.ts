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

test('Office export preserves actual reading editor formatting, widgets and partial selections',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'webo-office-reading-'));
 try {
  await build({stdin:{resolveDir:fileURLToPath(new URL('..',import.meta.url)),loader:'tsx',contents:`
   import React from 'react';import {createRoot} from 'react-dom/client';
   import Editor from './src/components/Editor';
   import {api} from './src/lib/api';import {useStore} from './src/lib/store';
   import {getActiveEditor} from './src/lib/activeEditor';
   import {exportOffice,officeSelection} from './src/lib/officeClipboard/export';
   import './src/styles/obsidian.css';
   const check=(ok,msg)=>{if(!ok)throw Error(msg)};
   api.tags=async()=>({tags:[]});api.propertyTypes=async()=>({types:{}});api.putUiState=async()=>({});
   const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a7n8AAAAASUVORK5CYII=';
   api.rawUrl=()=>png;
   const nativeFetch=window.fetch.bind(window);
   window.fetch=(url,opts)=>String(url).includes('/api/files/')?nativeFetch(png):String(url).startsWith('/api/')?Promise.resolve(new Response('{}',{status:404})):nativeFetch(url,opts);
   window.run=async()=>{
    const root=createRoot(document.querySelector('#root'));
    const content='## Heading\\n\\n**Bold** and *Italic*\\n\\n- First\\n- Second\\n\\n5. Fifth\\n6. Sixth\\n\\nBefore ![Image](pic.png) after\\n\\n| A | B |\\n| - | - |\\n| C | D |';
    useStore.setState({activePath:'Office.md',content,viewMode:'reading',showInlineTitle:false,locked:false,dirty:false,save:async()=>{}});
    root.render(<Editor/>);
    for(let i=0;i<100&&!document.querySelector('.cm-strong');i++)await new Promise(r=>setTimeout(r,20));
    const view=getActiveEditor();check(view?.state.readOnly,'actual readonly editor mounted');
    check(!!view.contentDOM.querySelector('.cm-widgetBuffer'),'actual CodeMirror widget buffers present');
    const selection=window.getSelection(),range=document.createRange();range.selectNodeContents(view.contentDOM);selection.removeAllRanges();selection.addRange(range);
    const output=await exportOffice(officeSelection(view.dom));
    const parsed=document.createElement('div');parsed.innerHTML=output.html;
    check(parsed.querySelector('h2')?.textContent==='Heading','reading heading is semantic: '+output.html);
    check(parsed.querySelector('strong')?.textContent==='Bold'&&parsed.querySelector('em')?.textContent==='Italic','reading emphasis is semantic');
    check(parsed.querySelectorAll('ul > li').length===2,'reading bullets become list items');
    check(parsed.querySelector('ol')?.getAttribute('start')==='5'&&parsed.querySelectorAll('ol > li').length===2,'reading ordered list retains start');
    check(parsed.querySelectorAll('img').length===1&&parsed.querySelector('img').src.startsWith('data:image/'),'only actual image exported');
    check(output.text.includes('Heading\\n')&&output.text.includes('First\\n'),'reading line boundaries retained');
    const strong=view.contentDOM.querySelector('.cm-strong');range.selectNodeContents(strong);selection.removeAllRanges();selection.addRange(range);
    const partial=await exportOffice(officeSelection(view.dom));check(partial.html.includes('<strong>Bold</strong>')&&!partial.html.includes('Italic'),'partial selection retains enclosing emphasis only');
    const cells=view.contentDOM.querySelectorAll('td');check(cells.length>=2,'table widget mounted');range.setStart(cells[0].firstChild,0);range.setEnd(cells[1].firstChild,1);selection.removeAllRanges();selection.addRange(range);
    const table=await exportOffice(officeSelection(view.dom));check(table.text==='C\\tD'&&table.html.includes('<table'),'partial widget table remains selected cells only');
    root.unmount();return 'OFFICE_READING_PASS';
   };
  `},bundle:true,format:'iife',platform:'browser',loader:{'.css':'empty'},define:{'import.meta.env.DEV':'false'},outfile:join(dir,'fixture.js'),logLevel:'silent'});
  await writeFile(join(dir,'index.html'),'<meta charset="utf-8"><div id="root"></div><script src="fixture.js"></script>');
  await writeFile(join(dir,'runner.cjs'),`const {app,BrowserWindow}=require('electron');app.setPath('userData',${JSON.stringify(join(dir,'profile'))});app.whenReady().then(async()=>{const win=new BrowserWindow({show:false,width:1200,height:1400,webPreferences:{backgroundThrottling:false}});win.webContents.on('console-message',(_e,_level,message)=>console.error(message));await win.loadFile(${JSON.stringify(join(dir,'index.html'))});const result=await win.webContents.executeJavaScript('window.run().then(value=>({value}),error=>({error:error.stack}))');if(result.error)throw Error(result.error);console.log(result.value);win.destroy();app.quit()}).catch(e=>{console.error(e);app.exit(1)});`);
  const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
  const {stdout}=await promisify(execFile)(createRequire(import.meta.url)('electron'),[...(process.platform==='linux'?['--ozone-platform=headless']:[]),join(dir,'runner.cjs')],{env,windowsHide:true,timeout:60_000});
  assert.match(stdout,/OFFICE_READING_PASS/);
 }finally{await rm(dir,{recursive:true,force:true});}
});
