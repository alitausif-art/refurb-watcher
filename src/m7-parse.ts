// Pure parsing for the M7 watcher (src/m7.ts): Apple's newsroom Atom feed and the Canadian Mac mini buy page.

export interface Entry {
  title: string;
  link: string;
  // ISO timestamp from <updated>; may be empty if Apple drops the element.
  updated: string;
  summary: string;
}

const CDATA = /<!\[CDATA\[([\s\S]*?)\]\]>/;

function text(block: string, tag: string): string {
  const m = block.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`));
  if (!m) return '';
  const inner = m[1] ?? '';
  const cdata = inner.match(CDATA);
  return (cdata ? (cdata[1] ?? '') : inner).replace(/\s+/g, ' ').trim();
}

// The article link is the <link> without a rel attribute; image enclosures carry rel="enclosure".
function articleLink(block: string): string {
  for (const m of block.matchAll(/<link\b([^>]*)\/?>/g)) {
    const attrs = m[1] ?? '';
    if (/\brel=/.test(attrs)) continue;
    const href = attrs.match(/\bhref="([^"]*)"/);
    if (href?.[1]) return href[1];
  }
  return '';
}

// Returns every entry in the feed. An empty array means the document did not look like Apple's feed.
export function parseNewsroom(xml: string): Entry[] {
  const entries: Entry[] = [];
  for (const m of xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)) {
    const block = m[1] ?? '';
    const title = text(block, 'title');
    const link = articleLink(block);
    if (!title || !link) continue;
    entries.push({ title, link, updated: text(block, 'updated'), summary: text(block, 'content') });
  }
  return entries;
}

// "M7", "M7 Pro", "M7 Max", "M7 Ultra" as a whole word; not "M70", "KM7" or "M6".
const M7 = /\bM7\b/;

export function isM7Entry(entry: Entry): boolean {
  return M7.test(entry.title) || M7.test(entry.summary);
}

function flattenSpaces(html: string): string {
  return html.replace(/&nbsp;| /g, ' ');
}

// Apple's buy page lists each configuration as "Mac mini, M6 Chip, 12-core CPU, …" and describes itself
// as "Mac mini with the M6 or M5 Pro chip". Any chip string at all proves the page still has that shape.
const ANY_CHIP = /\bM\d{1,2}(?: Pro| Max| Ultra)? [Cc]hip\b/;
const M7_CHIP = /\bM7(?: Pro| Max| Ultra)? [Cc]hip\b|\bMac mini with the M7\b/;

export function miniPageHasChipStrings(html: string): boolean {
  return ANY_CHIP.test(flattenSpaces(html));
}

export function miniPageHasM7(html: string): boolean {
  return M7_CHIP.test(flattenSpaces(html));
}
