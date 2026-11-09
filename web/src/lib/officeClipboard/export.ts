const allowed = new Set(['P','DIV','SPAN','BR','H1','H2','H3','H4','H5','H6','UL','OL','LI','STRONG','B','EM','I','U','S','DEL','A','TABLE','THEAD','TBODY','TFOOT','TR','TD','TH','IMG','BLOCKQUOTE','PRE','CODE','HR','SUB','SUP']);

export function officeSelection(container: HTMLElement): HTMLDivElement {
  const result=document.createElement('div');
  const selection=window.getSelection();
  if(!selection?.rangeCount || !container.contains(selection.anchorNode) || !container.contains(selection.focusNode))return result;
  const range=selection.getRangeAt(0);
  result.append(range.cloneContents());
  // cloneContents omits enclosing elements for a selection within one text node.
  // Keep those wrappers so a partial heading, emphasis span or table cell retains
  // its meaning, without copying any unselected siblings.
  let ancestor=range.commonAncestorContainer instanceof Element?range.commonAncestorContainer:range.commonAncestorContainer.parentElement;
  while(ancestor&&ancestor!==container) {
    const wrapper=ancestor.cloneNode(false) as Element;
    wrapper.append(...result.childNodes);result.append(wrapper);
    ancestor=ancestor.parentElement;
  }
  if(result.querySelector('td,th,tr')&&!result.querySelector('table')) {
    const table=document.createElement('table');
    if(!result.querySelector('tr')) {
      const row=document.createElement('tr');row.append(...result.childNodes);table.append(row);
    } else table.append(...result.childNodes);
    result.append(table);
  }
  if(result.querySelector('li')&&!result.querySelector('ul,ol')) {
    const ancestor=range.commonAncestorContainer instanceof Element?range.commonAncestorContainer:range.commonAncestorContainer.parentElement;
    const list=document.createElement(ancestor?.closest('ol')?'ol':'ul');list.append(...result.childNodes);result.append(list);
  }
  return result;
}

function retag(element: Element, tag: string): HTMLElement {
  const replacement=document.createElement(tag);
  for(const attr of Array.from(element.attributes))replacement.setAttribute(attr.name,attr.value);
  replacement.append(...element.childNodes);element.replaceWith(replacement);
  return replacement;
}

/** Reading mode uses styled CodeMirror lines/spans rather than semantic HTML. */
function normalizeReadingDOM(root: HTMLElement): void {
  root.querySelectorAll('.cm-widgetBuffer,.cm-block-actions,.cm-block-edit,.cm-fold-indicator').forEach(el=>el.remove());
  const listInfo=new WeakMap<Element,{type:'ul'|'ol';indent:number;start:number}>();
  for(const line of root.querySelectorAll('.HyperMD-list-line')) {
    const marker=line.querySelector('.cm-ol-marker');
    const start=Number(marker?.textContent?.match(/\d+/)?.[0]??1);
    const indent=(line.textContent?.match(/^\s*/)?.[0]??'').replace(/\t/g,'    ').length;
    const task=line.getAttribute('data-task');
    line.querySelectorAll('.cm-bullet,.cm-ol-marker,.cm-indent,.cm-indent-spacing,input[type="checkbox"]').forEach(el=>el.remove());
    if(task!==null)line.prepend(document.createTextNode(task===' '?'[ ] ':'[x] '));
    const item=retag(line,'li');
    listInfo.set(item,{type:marker?'ol':'ul',indent,start});
  }
  // Group adjacent decorated lines; indentation nests a list under its last item.
  for(const first of Array.from(root.querySelectorAll('li')).filter(el=>listInfo.has(el))) {
    if(!first.parentElement||first.parentElement.matches('ul,ol'))continue;
    const stack:{indent:number;type:'ul'|'ol';list:HTMLElement}[]=[];
    let item:Element|null=first;
    while(item&&listInfo.has(item)) {
      const next:Element|null=item.nextElementSibling,info=listInfo.get(item)!;
      while(stack.length&&stack.at(-1)!.indent>info.indent)stack.pop();
      let current=stack.at(-1);
      if(!current||current.indent!==info.indent||current.type!==info.type) {
        if(current?.indent===info.indent)stack.pop();
        const list=document.createElement(info.type);
        if(info.type==='ol')list.setAttribute('start',String(info.start));
        const parent=stack.at(-1);
        if(parent?.list.lastElementChild)parent.list.lastElementChild.append(list);
        else item.before(list);
        current={indent:info.indent,type:info.type,list};stack.push(current);
      }
      current.list.append(item);item=next;
    }
  }
  for(const line of root.querySelectorAll('.cm-line:not(li)')) {
    const heading=Array.from(line.classList).map(name=>/^cm-h([1-6])$/.exec(name)).find(Boolean);
    retag(line,heading?'h'+heading[1]:line.classList.contains('cm-blockquote')?'blockquote':'p');
  }
  for(const element of root.querySelectorAll('.cm-strong,.cm-em,.cm-inline-code,.cm-strike')) {
    const tags=[['cm-strong','strong'],['cm-em','em'],['cm-inline-code','code'],['cm-strike','del']].filter(([name])=>element.classList.contains(name)).map(([,tag])=>tag);
    let target=retag(element,tags[0]);
    for(const tag of tags.slice(1)) {
      const inner=document.createElement(tag);inner.append(...target.childNodes);target.append(inner);target=inner;
    }
  }
}

function plainText(node: Node): string {
  if(node.nodeType===Node.TEXT_NODE)return node.textContent??'';
  if(!(node instanceof Element))return '';
  if(node.tagName==='BR')return '\n';
  if(node.tagName==='IMG')return node.getAttribute('alt')??'';
  const content=Array.from(node.childNodes,plainText).join('');
  if(node.tagName==='LI')return content.replace(/\n+$/,'')+'\n';
  if(/^(P|DIV|H[1-6]|BLOCKQUOTE|PRE|UL|OL|TABLE)$/.test(node.tagName))return content+'\n\n';
  return content;
}

export async function exportOffice(source: Node): Promise<{html: string; text: string}> {
  const root = document.createElement('div');
  root.appendChild(source.cloneNode(true));
  normalizeReadingDOM(root);
  root.querySelectorAll('button,script,style,iframe,object,embed,svg,.embed-open-button,.callout-fold').forEach(el => el.remove());
  for (const element of Array.from(root.querySelectorAll('*'))) {
    if (!allowed.has(element.tagName)) { element.replaceWith(...element.childNodes); continue; }
    for (const attr of Array.from(element.attributes)) {
      if (!['href','src','alt','colspan','rowspan','start'].includes(attr.name)) element.removeAttribute(attr.name);
    }
    if (element instanceof HTMLAnchorElement && !/^(https?:|mailto:|tel:)/i.test(element.getAttribute('href') ?? '')) element.removeAttribute('href');
    if (element instanceof HTMLImageElement) {
      const src = element.getAttribute('src') ?? '';
      if (!/^data:image\/(png|jpeg|gif|webp|bmp);base64,/i.test(src)) {
        const url = new URL(src, location.href);
        if (url.origin !== location.origin && url.protocol !== 'https:') throw Error('Image cannot be copied');
        const response = await fetch(url, {credentials: url.origin === location.origin ? 'same-origin' : 'omit'});
        if (!response.ok) throw Error('Image cannot be copied');
        const blob = await response.blob();
        if (!/^image\/(png|jpeg|gif|webp|bmp)$/.test(blob.type)) throw Error('Unsupported image format');
        element.src = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsDataURL(blob); });
      }
    }
    if (element.tagName === 'TABLE') element.setAttribute('style','border-collapse:collapse');
    if (element.tagName === 'TD' || element.tagName === 'TH') element.setAttribute('style','border:1px solid #888;padding:4px 8px');
  }
  const tables = root.querySelectorAll('table');
  let text = plainText(root).replace(/\n{3,}/g,'\n\n').replace(/^\n+|\n+$/g,'');
  if (tables.length === 1 && root.textContent?.trim() === tables[0].textContent?.trim()) {
    text = Array.from(tables[0].rows, row => Array.from(row.cells, cell => cell.textContent ?? '').join('\t')).join('\n');
  }
  return {html: '<html><head><meta charset="utf-8"></head><body><!--StartFragment-->' + root.innerHTML + '<!--EndFragment--></body></html>', text};
}

/** Starts the browser clipboard write during the user gesture, before image loading. */
export async function copyOffice(source: Node): Promise<void> {
  const output = exportOffice(source);
  await navigator.clipboard.write([new ClipboardItem({
    'text/html': output.then(value => new Blob([value.html], {type:'text/html'})),
    'text/plain': output.then(value => new Blob([value.text], {type:'text/plain'})),
  })]);
}
