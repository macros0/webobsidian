import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, writeFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {build} from 'esbuild';

test('Canvas compact text cards show both lines and long cards scroll inside their bounds', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'webo-canvas-text-'));
  try {
    await build({
      stdin: {
        resolveDir: fileURLToPath(new URL('..', import.meta.url)), loader: 'tsx',
        contents: `
import React from 'react';
import {createRoot} from 'react-dom/client';
import CanvasView from './src/components/CanvasView';
import {useStore} from './src/lib/store';
import './src/styles/obsidian.css';
const check = (ok, message) => { if (!ok) throw Error(message); };
const wait = () => new Promise(resolve => setTimeout(resolve, 50));
const nodes = [
  {id:'short',type:'text',x:0,y:0,width:250,height:60,text:'Загрузка сообщений проактива'},
  {id:'long',type:'text',x:400,y:0,width:300,height:100,text:Array(30).fill('Строка текста').join('\\n')},
  {id:'colored',type:'text',x:800,y:0,width:250,height:100,text:'Colored card',color:'4'},
];
const original = JSON.stringify({nodes, edges:[]});
useStore.setState({activePath:'test.canvas',content:original,dirty:false});
window.run = async () => {
  document.body.classList.add('theme-dark');
  const host = document.createElement('div');
  host.style.cssText = 'width:1200px;height:800px';
  document.body.append(host);
  const root = createRoot(host);
  root.render(<CanvasView/>);
  for (let i=0;i<100 && host.querySelectorAll('.canvas-text-body p').length<2;i++) await wait();
  await document.fonts.ready;
  const bodies = [...host.querySelectorAll('.canvas-text-body')];
  const short = bodies[0], long = bodies[1];
  check(short && long, 'both cards rendered');
  check(getComputedStyle(short.closest('.canvas-node')).borderTopWidth === '1px', 'neutral cards keep the native thin border');
  check(getComputedStyle(bodies[2].closest('.canvas-node')).borderTopWidth === '3px', 'colored cards retain their colored border');
  check(host.querySelector('.canvas-zoom-pct').textContent === '100%', 'opening a small board preserves normal scale');
  const paragraph = short.querySelector('p');
  check(paragraph?.textContent.includes('проактива'), 'second line rendered');
  check(short.scrollHeight <= short.clientHeight + 1,
    'two-line card has unnecessary scrolling: '+JSON.stringify({height:short.clientHeight,scroll:short.scrollHeight}));
  const bodyRect = short.getBoundingClientRect(), textRect = paragraph.getBoundingClientRect();
  check(textRect.top >= bodyRect.top && textRect.bottom <= bodyRect.bottom, 'both lines visible within card');
  check(long.scrollHeight > long.clientHeight, 'long card scrolls');
  long.scrollTop = 100;
  check(long.scrollTop > 0, 'long card content remains reachable');
  check(useStore.getState().content === original && !useStore.getState().dirty, 'viewing preserves canvas bytes');
  const card = short.closest('.canvas-node');
  const point = card.getBoundingClientRect();
  card.dispatchEvent(new PointerEvent('pointerdown', {bubbles:true,button:0,pointerId:1,clientX:point.x+10,clientY:point.y+10}));
  host.querySelector('.canvas-view').dispatchEvent(new PointerEvent('pointerup', {bubbles:true,button:0,pointerId:1,clientX:point.x+10,clientY:point.y+10}));
  await wait();
  const menu = host.querySelector('.canvas-menu');
  check(menu?.querySelector('[title="Edit"]'), 'selection toolbar includes the native Edit action');
  check(JSON.stringify([...menu.querySelectorAll('.canvas-menu-row button')].map(button => button.title)) ===
    JSON.stringify(['Remove','Set color','Zoom to selection','Edit']), 'single text selection shows the four native actions');
  check(menu.querySelector('.canvas-menu-row').getBoundingClientRect().height === 34, 'native compact toolbar height');
  menu.querySelector('[title="Zoom to selection"]').click();
  await wait();
  check(short.scrollHeight <= short.clientHeight + 1, 'selection zoom leaves both text lines visible');
  host.querySelector('[title="Reset zoom (100%)"]').click();
  await wait();
  check(useStore.getState().content === original && !useStore.getState().dirty, 'zoom and reset preserve document bytes');
  check(short.scrollHeight <= short.clientHeight + 1, 'zoom leaves both text lines visible');
  menu.querySelector('[title="Edit"]').click();
  await wait();
  check(card.querySelector('textarea')?.value === nodes[0].text, 'Edit opens the selected text');
  root.unmount();
  return true;
};`,
      },
      bundle: true, format: 'iife', platform: 'browser',
      loader: {'.woff2':'file','.woff':'file','.ttf':'file'},
      define: {'import.meta.env.DEV':'false'}, outfile: join(dir, 'fixture.js'), logLevel: 'silent',
    });
    await writeFile(join(dir, 'index.html'), '<meta charset="utf-8"><link rel="stylesheet" href="fixture.css"><script src="fixture.js"></script>');
    await writeFile(join(dir, 'runner.cjs'), `
const {app,BrowserWindow}=require('electron');
app.setPath('userData',${JSON.stringify(join(dir, 'profile'))});
app.whenReady().then(async()=>{
  const w=new BrowserWindow({show:false,width:1440,height:1000,webPreferences:{backgroundThrottling:false}});
  await w.loadFile(${JSON.stringify(join(dir, 'index.html'))});
  const result=await w.webContents.executeJavaScript('window.run().catch(e=>({failure:e.stack}))');
  if(result?.failure)throw Error(result.failure);
  console.log('CANVAS_TEXT_LAYOUT_PASS');w.destroy();app.quit();
}).catch(e=>{console.error(e);app.exit(1)});`);
    const env = {...process.env};
    delete env.ELECTRON_RUN_AS_NODE;
    const {stdout} = await promisify(execFile)(createRequire(import.meta.url)('electron'), [
      ...(process.platform === 'linux' ? ['--ozone-platform=headless'] : []), join(dir, 'runner.cjs'),
    ], {env, windowsHide:true, timeout:60000});
    assert.match(stdout, /CANVAS_TEXT_LAYOUT_PASS/);
  } finally {
    assert.ok(dir.startsWith(join(tmpdir(), 'webo-canvas-text-')));
    await rm(dir, {recursive:true, force:true});
  }
});
