import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseFragment} from 'parse5';
import {importOffice,tableMarkdown} from '../src/lib/officeClipboard/import';

// Parse actual HTML with parse5 for conversion tests without a graphical session.
class HtmlNode {
  childNodes: HtmlNode[] = [];
  parentElement: HtmlNode | null = null;
  nodeType = 1;
  tagName: string;
  attrs: Record<string,string>;
  value = '';
  constructor(raw: any) {
    this.tagName = String(raw.tagName ?? '').toUpperCase();
    this.nodeType = raw.nodeName === '#text' ? 3 : 1;
    this.value = raw.value ?? '';
    this.attrs = Object.fromEntries((raw.attrs ?? []).map((attr: any) => [attr.name,attr.value]));
    this.childNodes = (raw.childNodes ?? []).map((child: any) => {const node = new HtmlNode(child);node.parentElement=this;return node;});
  }
  get textContent(): string {return this.nodeType===3 ? this.value : this.childNodes.map(node=>node.textContent).join('');}
  get children() {return this.childNodes.filter(node=>node.nodeType===1);}
  getAttribute(name: string) {return this.attrs[name]??null;}
  closest(tag: string): HtmlNode | null {return this.tagName===tag.toUpperCase()?this:this.parentElement?.closest(tag)??null;}
  querySelectorAll(selector: string): HtmlNode[] {const tags=selector.toUpperCase().split(',');return this.childNodes.flatMap(child=>[...(tags.includes(child.tagName)?[child]:[]),...child.querySelectorAll(selector)]);}
  querySelector(selector: string) {return this.querySelectorAll(selector)[0]??null;}
  remove() {if(this.parentElement)this.parentElement.childNodes=this.parentElement.childNodes.filter(child=>child!==this);}
}
Object.assign(globalThis,{Node:{TEXT_NODE:3},Element:HtmlNode,document:{createElement:()=>({content:null,set innerHTML(html: string){this.content=new HtmlNode(parseFragment(html)) as any;}})}});
const noUpload=async()=>{throw Error('Unexpected upload');};

test('HTML table retains first data row, blank cells, merged cells and inline formatting',async()=>{
  const result=await importOffice('<h2>Title</h2><p><b>Bold</b><i>Italic</i></p><table><tr><td>00123</td><td></td><td>150</td></tr><tr><td>A|B</td><td>x<br>y</td><td>Дата</td></tr></table>','',[],noUpload);
  assert.match(result!,/## Title/);assert.match(result!,/\*\*Bold\*\*/);assert.match(result!,/\*Italic\*/);
  assert.ok(result!.includes('| 00123 |  | 150 |'));assert.ok(result!.includes('A\\|B'));assert.ok(result!.includes('x<br>y'));
  const merged=await importOffice('<table><tr><td rowspan="2">A</td><td>B</td></tr><tr><td>C</td></tr></table>','',[],noUpload);
  assert.ok(merged!.includes('|  | C |'));
});
test('TSV handles trailing empty cells, quoted newlines and escaped quotes',async()=>{
  assert.ok((await importOffice('','00123\t\t150\r\na\tb\tc\r\n',[],noUpload))!.includes('| 00123 |  | 150 |'));
  assert.ok((await importOffice('','"first\nsecond"\t"a""b"',[],noUpload))!.includes('first<br>second | a"b'));
  assert.equal(await importOffice('','plain text',[],noUpload),null);
  assert.equal(await importOffice('','a\tb\nwrong',[],noUpload),null);
  assert.ok(tableMarkdown([['a','']]).includes('| a |  |'));
  const literal=await importOffice('','**total**\t<b>x</b>',[],noUpload);
  assert.ok(literal!.includes('\\*\\*total\\*\\*'));
});
test('mixed images keep positions, failures retain text and Excel screenshots are ignored',async()=>{
  const file=new File(['x'],'a.png',{type:'image/png'});let count=0;
  const result=await importOffice('<p>Before<img src="file:///a">Middle<img src="cid:b">After</p>','',[file,file],async()=>`![[image${++count}.png]]`);
  assert.equal(result,'Before![[image1.png]]Middle![[image2.png]]After');
  count=0;await importOffice('<table><tr><td>A</td></tr></table>','',[file],async()=>{count++;return 'image';});assert.equal(count,0);
  assert.equal(await importOffice('<p>Before<img src="cid:x">After</p>','',[file],noUpload),'Before[Image unavailable]After');
});
test('unsafe HTML and URLs do not enter Markdown',async()=>{
  const result=await importOffice('<p>Safe<script>BAD</script><a href="javascript:alert(1)">label</a><img src="https://remote.invalid/pixel"></p>','',[],noUpload);
  assert.equal(result,'Safelabel[Image unavailable]');
});
test('data images match duplicate clipboard files before resolving subsequent images',async()=>{
  const first=new File(['x'],'first.png',{type:'image/png'}),second=new File(['y'],'second.png',{type:'image/png'});
  const result=await importOffice('<p><img src="data:image/png;base64,eA=="><img src="cid:second"></p>','',[first,second],async file=>file.text());
  assert.equal(result,'xy');
});
test('HTML headers and Word list paragraphs retain their roles',async()=>{
  const result=await importOffice('<table><thead><tr><th>Header</th></tr></thead><tbody><tr><td>Value</td></tr></tbody></table><p style="mso-list:l0 level1 lfo1">1. First</p><p><span style="font-style:italic">Italic</span></p>','',[],noUpload);
  assert.ok(result!.startsWith('| Header |\n| --- |\n| Value |'));
  assert.ok(result!.includes('1. First'));assert.ok(result!.includes('*Italic*'));
});
