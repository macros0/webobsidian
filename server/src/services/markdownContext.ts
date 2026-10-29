// Pure Markdown context shared with the browser. No server or filesystem APIs.
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import { inlineFootnoteRanges } from './markdownDialect.js';

const parser = unified().use(remarkParse).use(remarkGfm);
export interface SourceRange { from: number; to: number }
interface Node {
  type: string;
  value?: string;
  depth?: number;
  position?: { start: { offset?: number }; end: { offset?: number } };
  children?: Node[];
}

/** Source positions for the Reading adapter; rendering never rewrites the doc. */
export function footnoteRanges(source: string): { references: SourceRange[]; definitions: SourceRange[] } {
  const references: SourceRange[] = [], definitions: SourceRange[] = [], literal: SourceRange[] = [];
  const visit = (node: Node) => {
    const from = node.position?.start.offset, to = node.position?.end.offset;
    if (from === undefined || to === undefined) return;
    if (['code', 'inlineCode', 'html'].includes(node.type)) { literal.push({ from, to }); return; }
    if (node.type === 'footnoteDefinition') { definitions.push({ from, to }); return; }
    if (node.type === 'footnoteReference') references.push({ from, to });
    node.children?.forEach(visit);
  };
  visit(parser.parse(source) as Node);
  const blocked = [...literal, ...definitions, ...findObsidianComments(source)];
  references.push(...inlineFootnoteRanges(source).filter(r =>
    !isEscaped(source, r.from) && !blocked.some(b => r.from >= b.from && r.from < b.to)));
  return { references: references.filter(r => !blocked.some(b => r.from >= b.from && r.from < b.to)).sort((a,b) => a.from - b.from), definitions };
}

/** Select a heading and its subsections; missing/unsupported fragments are explicit. */
export function selectHeading(source: string, fragment: string): string | null {
  if (!fragment) return source;
  if (/^\^[a-zA-Z0-9-]+$/.test(fragment)) return selectBlock(source, fragment.slice(1));
  const headings: Node[] = [];
  const visit = (node: Node) => {
    if (node.type === 'heading') headings.push(node);
    else node.children?.forEach(visit);
  };
  visit(parser.parse(source) as Node);
  const label = (node: Node): string => node.value ?? node.children?.map(label).join('') ?? '';
  const normalize = (s: string) => s.trim().normalize('NFC').toLowerCase();
  let index = -1, end = headings.length;
  for (const segment of fragment.split('#')) {
    if (!segment) return null;
    const nextIndex = headings.findIndex((node, i) => i > index && i < end && normalize(label(node)) === normalize(segment));
    if (nextIndex < 0) return null;
    index = nextIndex;
    const boundary = headings.findIndex((node, i) => i > index && node.depth! <= headings[index].depth!);
    end = boundary < 0 ? headings.length : boundary;
  }
  const heading = headings[index];
  const next = headings.slice(index + 1).find(node => node.depth! <= heading.depth!);
  return source.slice(heading.position!.start.offset, next?.position?.start.offset);
}

function selectBlock(source: string, id: string): string | null {
  let selected: string | null = null;
  const visit = (parent: Node) => {
    if (selected !== null || ['code', 'inlineCode', 'html'].includes(parent.type)) return;
    parent.children?.forEach((node, index, siblings) => {
      if (selected !== null) return;
      if (node.type === 'paragraph') {
        const raw = source.slice(node.position!.start.offset, node.position!.end.offset);
        const suffix = new RegExp(`(?:^|\\s)\\^${id}\\s*$`);
        if (suffix.test(raw)) {
          if (raw.trim() === `^${id}`) {
            const previous = siblings[index - 1];
            if (previous) selected = source.slice(previous.position!.start.offset, previous.position!.end.offset);
          } else {
            const last = node.children?.at(-1);
            if (last?.type === 'text' && suffix.test(last.value ?? '')) selected = raw.replace(suffix, '');
          }
        }
      }
      visit(node);
    });
  };
  visit(parser.parse(source) as Node);
  return selected;
}

/** Protect literal/parser-owned regions before Obsidian extension transforms. */
export function protectMarkdown(source: string) {
  const ranges: { from: number; to: number; html?: boolean }[] = [];
  const visit = (node: Node) => {
    if (['code', 'inlineCode', 'html'].includes(node.type)) {
      const from = node.position?.start.offset, to = node.position?.end.offset;
      if (from !== undefined && to !== undefined) ranges.push({ from, to, html: node.type === 'html' });
      return;
    }
    node.children?.forEach(visit);
  };
  visit(parser.parse(source) as Node);
  // Protect complete escape pairs, so an even number of backslashes still lets
  // the following Markdown open normally. Escaped embeds are literal as a unit.
  for (const m of source.matchAll(/\\(?:!\[\[[^\]\n]*\]\]|[!"#$%&'()*+,\-./:;<=>?@[\]\\^_`{|}~])/g)) {
    if (!ranges.some(r => m.index! < r.to && m.index! + m[0].length > r.from)) {
      ranges.push({ from: m.index!, to: m.index! + m[0].length });
    }
  }
  ranges.sort((a, b) => a.from - b.from);
  let prefix = '\uE000protected';
  while (source.includes(prefix)) prefix += '_';
  const values: string[] = [];
  const restore = (value: string) => value.replace(new RegExp(`${prefix}(\\d+)\uE001`, 'g'), (_, index) => values[+index]);
  // Flatten before storing generated markup, so placeholders cannot escape in
  // nested math/link labels. Stored original source never contains our prefix.
  const stash = (value: string) => `${prefix}${values.push(restore(value)) - 1}\uE001`;
  let text = '', cursor = 0;
  for (const range of ranges) {
    const raw = source.slice(range.from, range.to);
    text += source.slice(cursor, range.from) + stash(range.html ? preserveLiteralTags(raw) : raw);
    cursor = range.to;
  }
  text += source.slice(cursor);
  return { text, stash, restore };
}

export function isEscaped(source: string, offset: number): boolean {
  let count = 0;
  for (let i = offset - 1; i >= 0 && source[i] === '\\'; i--) count++;
  return count % 2 === 1;
}

/** Obsidian comments are not active inside literal code or HTML. */
export function findObsidianComments(source: string): SourceRange[] {
  const literal: SourceRange[] = [];
  const visit = (node: Node) => {
    if (['code', 'inlineCode', 'html'].includes(node.type)) {
      const from = node.position?.start.offset, to = node.position?.end.offset;
      if (from !== undefined && to !== undefined) literal.push({ from, to });
    } else node.children?.forEach(visit);
  };
  visit(parser.parse(source) as Node);
  const ranges: SourceRange[] = [];
  let start = -1;
  for (const match of source.matchAll(/%%/g)) {
    const at = match.index!;
    if (isEscaped(source, at)) continue;
    if (start >= 0) { ranges.push({ from: start, to: at + 2 }); start = -1; }
    else if (!literal.some(r => at >= r.from && at < r.to)) start = at;
  }
  return ranges;
}

export function stripObsidianComments(source: string): string {
  let result = source;
  for (const r of findObsidianComments(source).reverse()) result = result.slice(0, r.from) + result.slice(r.to);
  return result;
}

/** Preserve non-HTML identifiers when a real HTML fragment surrounds them. */
export function preserveLiteralTags(html: string): string {
  return html.replace(/<!--[\s\S]*?-->|<\/?([a-zA-Z][^\s/>]*)(?:[^>"']|"[^"]*"|'[^']*')*>/g, (token, name?: string) => {
    if (!name || /^[a-zA-Z][a-zA-Z0-9-]*$/.test(name)) return token;
    return token.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  });
}
