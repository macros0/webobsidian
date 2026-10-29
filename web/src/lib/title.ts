const MINOR = new Set([
  'a', 'an', 'the', 'and', 'but', 'or', 'nor', 'at', 'by', 'from', 'in', 'it', 'of', 'on', 'to', 'up', 'with',
]);

const cap = (w: string) => w.charAt(0).toUpperCase() + w.slice(1);

/** Human-readable title from a note filename or path (never alters the real filename). */
export function humanizeTitle(nameOrPath: string): string {
  const base = (nameOrPath.split('/').pop() ?? nameOrPath).replace(/\.(md|markdown)$/i, '');
  // Names without kebab/snake separators are shown exactly as written.
  if (!/[-_]/.test(base)) return base;
  const words = base.split(/[-_\s]+/).filter(Boolean);
  return words
    .map((w, i) => {
      const lower = w.toLowerCase();
      const edge = i === 0 || i === words.length - 1;
      if (!edge && MINOR.has(lower)) return lower;
      // Keep words with intentional capitals (e.g. "OAuth"); capitalise plain lowercase ones.
      return w === lower ? cap(w) : w;
    })
    .join(' ');
}

/** Frontmatter `title` value, if the note defines one. */
export function frontmatterTitle(content: string): string | null {
  const fm = content.match(/^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/);
  if (!fm) return null;
  const m = fm[1].match(/^title[ \t]*:[ \t]*(.*?)[ \t]*$/m);
  if (!m) return null;
  let v = m[1];
  const q = v.match(/^(["'])(.*)\1(?:[ \t]+#.*)?$/);
  v = q ? q[2] : v.replace(/[ \t]+#.*$/, '');
  v = v.trim();
  return v || null;
}

/** Title shown for a note: frontmatter `title`, else humanized filename. */
export function displayTitle(path: string, content: string): string {
  return frontmatterTitle(content) ?? humanizeTitle(path);
}
