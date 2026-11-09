/** A conservative conversion of clipboard HTML to editable Markdown. */
export function tableMarkdown(rows: string[][], header = false): string {
  const width = Math.max(0, ...rows.map(row => row.length));
  if (!width) return '';
  const line = (row: string[]) => '| ' + Array.from({length: width}, (_, i) => (row[i] ?? '').trim().replace(/\|/g, '\\|').replace(/\r?\n/g, '<br>')).join(' | ') + ' |';
  return [line(header ? rows[0] : []), line(Array(width).fill('---')), ...rows.slice(header ? 1 : 0).map(line)].join('\n');
}

function readTsv(text: string): string[][] | null {
  if (!text.includes('\t')) return null;
  const rows: string[][] = [[]];
  let value = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"' && (quoted || value === '')) {
      if (quoted && text[i + 1] === '"') { value += '"'; i++; }
      else quoted = !quoted;
    } else if (!quoted && (char === '\t' || char === '\n' || char === '\r')) {
      rows.at(-1)!.push(value); value = '';
      if (char !== '\t') {
        if (char === '\r' && text[i + 1] === '\n') i++;
        if (i < text.length - 1) rows.push([]);
      }
    } else value += char;
  }
  if (quoted) return null;
  if (!/[\r\n]$/.test(text) || value) rows.at(-1)!.push(value);
  return rows.length && rows[0].length > 1 && rows.every(row => row.length === rows[0].length) ? rows : null;
}

const escapeText = (text: string) => text.replace(/\\/g, '\\\\').replace(/([*_`\[\]<>])/g, '\\$1');
const safeLink = (url: string) => /^(https?:|mailto:|tel:)/i.test(url);

export async function importOffice(html: string, plain: string, files: File[], upload: (file: File) => Promise<string>, missingImage = '[Image unavailable]'): Promise<string | null> {
  if (!html) {
    const rows = readTsv(plain);
    return rows ? tableMarkdown(rows.map(row=>row.map(escapeText))) : null;
  }
  // Template content stays detached and inert, including remote image elements.
  const template = document.createElement('template');
  template.innerHTML = html;
  const root = template.content;
  root.querySelectorAll('script,style,iframe,object,embed,link,meta,head,xml').forEach(node => node.remove());
  if (!root.querySelector('p,div,h1,h2,h3,h4,h5,h6,table,ul,ol,li,b,strong,i,em,a,img,br,pre,blockquote')) return null;
  const available = new Set(files.map((_,index)=>index));
  const dataImages = new Map<string,File>();
  for (const image of root.querySelectorAll('img')) {
    const src=image.getAttribute('src')??'';
    if (!/^data:image\/(png|jpeg|gif|webp|bmp);base64,/i.test(src)) continue;
    try {
      const blob=await (await fetch(src)).blob();
      const file=new File([blob],'office-image.'+(blob.type.split('/')[1]||'png'),{type:blob.type});
      dataImages.set(src,file);
      const bytes=new Uint8Array(await file.arrayBuffer());
      for(const index of available) {
        if(files[index].size!==file.size)continue;
        const candidate=new Uint8Array(await files[index].arrayBuffer());
        if(candidate.every((value,i)=>value===bytes[i])){available.delete(index);break;}
      }
    } catch { /* retain image marker */ }
  }
  const unresolved=Array.from(root.querySelectorAll('img')).filter(image=>!dataImages.has(image.getAttribute('src')??''));
  const assigned=new Map<Element,File>();
  for(const image of unresolved) {
    const name=(image.getAttribute('src')??'').split(/[\\/:]/).at(-1);
    const matching=Array.from(available).filter(index=>files[index].name===name);
    if(matching.length===1){assigned.set(image,files[matching[0]]);available.delete(matching[0]);}
  }
  const remaining=unresolved.filter(image=>!assigned.has(image));
  // Ordered matching is safe only when each remaining image has a file.
  if(remaining.length===available.size) {
    const indexes=Array.from(available);
    remaining.forEach((image,index)=>assigned.set(image,files[indexes[index]]));
  }
  async function children(node: Node): Promise<string> {
    const result: string[] = [];
    for (const child of node.childNodes) result.push(await convert(child));
    return result.join('');
  }
  async function convert(node: Node): Promise<string> {
    if (node.nodeType === Node.TEXT_NODE) return escapeText((node.textContent ?? '').replace(/\s+/g, ' '));
    if (!(node instanceof Element)) return '';
    const tag = node.tagName.toLowerCase();
    if (tag.includes(':')) return children(node);
    if (tag === 'img') {
      const src = node.getAttribute('src') ?? '';
      const file = dataImages.get(src) ?? assigned.get(node);
      if (!file) return node.getAttribute('alt') ? escapeText(node.getAttribute('alt')!) : missingImage;
      try { return await upload(file); } catch { return missingImage; }
    }
    if (tag === 'table') {
      const rows: string[][] = [];
      const occupied = new Set<string>();
      const sourceRows = Array.from(node.querySelectorAll('tr')).filter(row => row.closest('table') === node);
      for (let r = 0; r < sourceRows.length; r++) {
        const row = rows[r] ??= [];
        let c = 0;
        for (const cell of Array.from(sourceRows[r].children).filter(el => /^(TD|TH)$/.test(el.tagName))) {
          while (occupied.has(r + ':' + c)) c++;
          const across = Math.min(100, Math.max(1, Number(cell.getAttribute('colspan')) || 1));
          const down = Math.min(sourceRows.length - r, Math.max(1, Number(cell.getAttribute('rowspan')) || 1));
          row[c] = (await children(cell)).trim();
          for (let dr = 0; dr < down; dr++) for (let dc = 0; dc < across; dc++) {
            occupied.add((r + dr) + ':' + (c + dc));
            if (dr || dc) (rows[r + dr] ??= [])[c + dc] = '';
          }
          c += across;
        }
      }
      const hasHeader=sourceRows[0]?.querySelector('th')!==null;
      return '\n\n' + tableMarkdown(rows,hasHeader) + '\n\n';
    }
    if (tag === 'pre') return '\n\n````\n' + (node.textContent ?? '').replace(/`{4,}/g, '```') + '\n````\n\n';
    const content = await children(node);
    if (tag === 'br') return '\n';
    if (/^h[1-6]$/.test(tag)) return '\n\n' + '#'.repeat(Number(tag[1])) + ' ' + content.trim() + '\n\n';
    if (tag === 'b' || tag === 'strong' || (tag === 'span' && /font-weight:\s*(bold|[7-9]00)/i.test(node.getAttribute('style') ?? ''))) return '**' + content + '**';
    if (tag === 'i' || tag === 'em' || (tag==='span' && /font-style:\s*italic/i.test(node.getAttribute('style')??''))) return '*' + content + '*';
    if(tag==='p' && /mso-list:\s*l\d+/i.test(node.getAttribute('style')??'')) {
      return '\n' + (/^\s*\d+[.)]/.test(content)?'1. ':'- ') + content.trim().replace(/^(?:\d+[.)]|[•·o])\s*/, '') + '\n';
    }
    if (tag === 'a') { const href = node.getAttribute('href') ?? ''; return safeLink(href) ? '[' + content + '](' + href.replace(/[\s()<>]/g, encodeURIComponent) + ')' : content; }
    if (tag === 'li') {
      const ordered = node.parentElement?.tagName === 'OL';
      const index = ordered ? Number(node.parentElement?.getAttribute('start') || 1) + Array.from(node.parentElement!.children).indexOf(node) : 0;
      return '\n' + (ordered ? index + '. ' : '- ') + content.trim().replace(/\n/g, '\n  ') + '\n';
    }
    if (tag === 'blockquote') return '\n\n' + content.trim().split('\n').map(line => '> ' + line).join('\n') + '\n\n';
    if (['p','div','ul','ol'].includes(tag)) return '\n\n' + content.trim() + '\n\n';
    return content;
  }
  return (await children(root)).replace(/\n{3,}/g, '\n\n').trim();
}
