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

test('Office clipboard preserves cells, formatting, ordered images and detached exports',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'webo-office-'));
 try{
  await build({stdin:{resolveDir:fileURLToPath(new URL('..',import.meta.url)),loader:'ts',contents:`
   import {importOffice,tableMarkdown} from './src/lib/officeClipboard/import';
   import {exportOffice,officeSelection} from './src/lib/officeClipboard/export';
   const check=(ok,msg)=>{if(!ok)throw Error(msg)};
   window.run=async()=>{
    const text=await importOffice('<h2>Title</h2><p><b>Bold</b> <i>Italic</i><script>BAD</script><a href="javascript:alert(1)">Safe</a></p><table><tr><td>00123</td><td></td><td>150</td></tr><tr><td>A|B</td><td>x<br>y</td><td>Дата</td></tr></table>','',[],async()=>{throw Error('Unexpected image')});
    check(text.includes('## Title')&&text.includes('**Bold**')&&text.includes('*Italic*'),'formatting');
    check(!text.includes('BAD')&&!text.includes('javascript:'),'inert HTML');
    check(text.includes('| 00123 |  | 150 |')&&text.includes('A\\\\|B')&&text.includes('x<br>y'),'cells and escaping '+text);
    check(tableMarkdown([['a',''],['b','c']]).includes('| a |  |'),'empty cell');
    check((await importOffice('', 'a\\tb\\n1\\t2',[],async()=>'' )).includes('| 1 | 2 |'),'TSV');
    check(await importOffice('', 'plain text',[],async()=>'')===null,'plain text fallback');
    check((await importOffice('<table><tr><td rowspan="2">A</td><td>B</td></tr><tr><td>C</td></tr></table>','',[],async()=>'')).includes('|  | C |'),'merged cells');
    const image=new File(['x'],'image.png',{type:'image/png'});let uploads=0;
    const mixed=await importOffice('<p>Before<img src="file:///tmp/a.png">Middle<img src="cid:b">After</p>','',[image,image],async()=> '![[image'+(++uploads)+'.png]]');
    check(mixed.indexOf('Before')<mixed.indexOf('image1')&&mixed.indexOf('image1')<mixed.indexOf('Middle')&&mixed.indexOf('Middle')<mixed.indexOf('image2')&&mixed.indexOf('image2')<mixed.indexOf('After'),'image ordering');
    uploads=0;await importOffice('<table><tr><td>A</td></tr></table>','',[image],async()=>{uploads++;return ''});check(uploads===0,'Excel screenshot ignored');
    const root=document.createElement('div');root.innerHTML='<p>Text<button>Open</button></p><table><tr><td>A</td><td></td><td>B</td></tr></table><img src="data:image/png;base64,eA==">';
    const output=await exportOffice(root);check(!output.html.includes('<button')&&output.html.includes('data:image/png'),'export cleanup');
    const onlyTable=await exportOffice(root.querySelector('table'));check(onlyTable.text==='A\\t\\tB','Excel text cells');
    document.body.append(root);const cells=root.querySelectorAll('td'),range=document.createRange();range.setStart(cells[0].firstChild,0);range.setEnd(cells[2].firstChild,1);window.getSelection().removeAllRanges();window.getSelection().addRange(range);
    const selected=await exportOffice(officeSelection(root));check(selected.html.includes('<table')&&selected.text==='A\\t\\tB','partial table selection reconstructed');
    const paragraphs=document.createElement('div');paragraphs.innerHTML='<p>First</p><p>Second<br>Third</p>';
    check((await exportOffice(paragraphs)).text==='First\\n\\nSecond\\nThird','plain text retains block boundaries');
    return 'OFFICE_PASS';
   };
  `},bundle:true,format:'iife',platform:'browser',outfile:join(dir,'fixture.js'),logLevel:'silent'});
  await writeFile(join(dir,'index.html'),'<meta charset="utf-8"><script src="fixture.js"></script><script>window.run().then(value=>document.body.textContent=value).catch(error=>document.body.textContent="FAIL "+error.stack)</script>');
  await writeFile(join(dir,'runner.cjs'),`const {app,BrowserWindow}=require('electron');app.setPath('userData',${JSON.stringify(join(dir,'profile'))});app.whenReady().then(async()=>{const win=new BrowserWindow({show:false});await win.loadFile(${JSON.stringify(join(dir,'index.html'))});console.log(await win.webContents.executeJavaScript('window.run()'));win.destroy();app.quit()}).catch(e=>{console.error(e);app.exit(1)});`);
  const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
  const browser=process.env.WEBO_TEST_CHROME;
  const {stdout}=await promisify(execFile)(browser ?? createRequire(import.meta.url)('electron'),browser
   ? ['--headless','--disable-gpu','--no-first-run','--user-data-dir='+join(dir,'chrome-profile'),'--dump-dom','--virtual-time-budget=5000',new URL('file:///'+join(dir,'index.html').replaceAll('\\','/')).href]
   : [...(process.platform==='linux'?['--ozone-platform=headless']:[]),join(dir,'runner.cjs')],{env,windowsHide:true,timeout:60_000});
  assert.match(stdout,/OFFICE_PASS/);
 }finally{await rm(dir,{recursive:true,force:true});}
});
