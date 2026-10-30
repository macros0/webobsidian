import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { build } from 'esbuild';
test('browser: recovery after reload and repeated version conflict', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'webo-recovery-'));
    try {
        await build({ stdin: { resolveDir: fileURLToPath(new URL('..', import.meta.url)), loader: 'tsx', contents: `
 import React from 'react';import {createRoot} from 'react-dom/client';
 import DraftRecovery from './src/components/DraftRecovery';import {api,ApiError} from './src/lib/api';
 import {useStore,documentSessions,resetDraftScope} from './src/lib/store';import {putDraft,listDrafts} from './src/lib/drafts/storage';
 import {EditorView} from '@codemirror/view';import './src/styles/obsidian.css';
 const source={scopeId:'recovery-scope',path:'a.md',writerId:'old-tab',schemaVersion:1,revision:1,updatedAt:Date.now(),baseVersion:'v1',baseContent:'base',content:'mine',kind:'text',state:'dirty'};
 window.run=async()=>{await putDraft(source);return true;
 };
 window.resume=async()=>{
 const check=(v,m)=>{if(!v)throw Error(m)};const wait=()=>new Promise(r=>setTimeout(r,100));
 check((await listDrafts('recovery-scope')).some(r=>r.content==='mine'),'draft survived reload');
 const calls=[];let remoteVersion='v2';api.draftScope=async()=>({scopeId:'recovery-scope'});api.read=async()=>({content:'server',version:remoteVersion});
 api.write=async(path,content,version)=>{calls.push({path,content,version});if(calls.length===1){remoteVersion='v3';throw new ApiError('version_conflict',409);}return {ok:true,version:'v4'};};
 document.body.innerHTML='<div class="theme-dark" id="root"></div>';useStore.setState({authed:true,activePath:null});const root=createRoot(document.querySelector('#root'));root.render(<DraftRecovery/>);await wait();
 const button=text=>Array.from(document.querySelectorAll('button')).find(b=>b.textContent.includes(text));
 button('Local drafts').click();await wait();button('Recover / Compare').click();await wait();
 check(!!document.querySelector('[aria-label="Resolve conflict"]'),'resolver opens');
 const editor=EditorView.findFromDOM(document.querySelector('.conflict-editor .cm-editor'));editor.dispatch({changes:{from:0,to:editor.state.doc.length,insert:'merged'}});await wait();
 button('Save result').click();await wait();check(document.querySelector('[role="alert"]').textContent.includes('changed again'),'repeat conflict explained');
 check(document.querySelector('.conflict-editor').textContent.includes('merged'),'manual result kept');
 button('Save result').click();await wait();check(calls.length===2&&calls[0].version==='v2'&&calls[1].version==='v3','reviewed server version used');check(calls[1].content==='merged','result saved');
 check((await listDrafts('recovery-scope')).length===0,'confirmed revisions cleared');root.unmount();
 // A successful write followed by a failed refresh/cleanup must keep the live journal.
 resetDraftScope();api.draftScope=async()=>({scopeId:'review-scope'});let failRead=false;
 api.read=async()=>{if(failRead)throw Error('offline refresh');return {content:'base',version:'v1'}};
 await useStore.getState().openFile('live.md');useStore.getState().setContent('mine');const live=documentSessions.get('live.md');await live.flush();live.state='conflict';
 const second=createRoot(document.querySelector('#root'));second.render(<DraftRecovery/>);await wait();
 button('Resolve conflict').click();await wait();
 const originalDelete=IDBObjectStore.prototype.delete;let failDelete=true;
 IDBObjectStore.prototype.delete=function(...args){if(failDelete){failDelete=false;throw Error('cleanup blocked')}return originalDelete.apply(this,args)};
 api.write=async()=>{failRead=true;return {ok:true,version:'v2'}};
 button('Save result').click();await wait();await wait();IDBObjectStore.prototype.delete=originalDelete;
 check(!document.querySelector('[aria-label="Resolve conflict"]'),'server success is acknowledged even when cleanup fails');
 check(documentSessions.has('live.md'),'live session survives failed refresh');
 useStore.getState().setContent('after successful merge');await documentSessions.get('live.md').flush();
 check((await listDrafts('review-scope')).some(r=>r.content==='after successful merge'),'next edit is recoverable');
 // Scope reset invalidates an already pending compare.
 useStore.setState({dirty:false});button('Local drafts').click();await wait();
 let release;api.read=()=>new Promise(r=>{release=r});button('Recover / Compare').click();await wait();
 resetDraftScope();api.draftScope=async()=>({scopeId:'other-scope'});release({content:'other vault',version:'other'});await wait();
 check(!document.querySelector('[aria-label="Resolve conflict"]'),'stale compare cannot reopen after vault switch');
 second.unmount();return true;
 };` }, bundle: true, format: 'iife', platform: 'browser', define: { 'import.meta.env.DEV': 'false' }, outfile: join(dir, 'fixture.js'), logLevel: 'silent' });
        await writeFile(join(dir, 'index.html'), '<link rel="stylesheet" href="fixture.css"><script src="fixture.js"></script>');
        await writeFile(join(dir, 'runner.cjs'), `const {app,BrowserWindow}=require('electron');app.setPath('userData',${JSON.stringify(join(dir, 'profile'))});app.whenReady().then(async()=>{const w=new BrowserWindow({show:false,width:1440,height:900,webPreferences:{backgroundThrottling:false}});await w.loadFile(${JSON.stringify(join(dir, 'index.html'))});await w.webContents.executeJavaScript(process.argv.includes('--seed')?'window.run()':'window.resume()');console.log('OVERFLOW_PASS');w.destroy();app.quit()}).catch(e=>{console.error(e);app.exit(1)});`);
        const env = { ...process.env };
        delete env.ELECTRON_RUN_AS_NODE;
        await promisify(execFile)(createRequire(import.meta.url)('electron'), [join(dir, 'runner.cjs'), '--seed'], { env, windowsHide: true, timeout: 60000 });
        const { stdout } = await promisify(execFile)(createRequire(import.meta.url)('electron'), [...(process.platform === 'linux' ? ['--ozone-platform=headless'] : []), join(dir, 'runner.cjs')], { env, windowsHide: true, timeout: 60000 });
        assert.match(stdout, /OVERFLOW_PASS/);
    }
    finally {
        await rm(dir, { recursive: true, force: true });
    }
});
