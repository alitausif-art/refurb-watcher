import { MATCH } from './config.ts';

export interface Tile {
  partNumber: string;
  title: string;
  price: number;
  url: string;
}

const BOOTSTRAP_MARKER = 'window.REFURB_GRID_BOOTSTRAP';
const ORIGIN = 'https://www.apple.com';

// Apple titles mix non-breaking hyphens/spaces and stray whitespace; flatten to plain ASCII spacing.
export function normalizeTitle(title: string): string {
  return title
    .replace(/[‐‑‒–]/g, '-')
    .replace(/[  ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Slice out the JSON object literal that follows the marker by matching braces outside of strings.
function extractBootstrapJson(html: string): string | undefined {
  const marker = html.indexOf(BOOTSTRAP_MARKER);
  if (marker === -1) return undefined;
  const start = html.indexOf('{', marker);
  if (start === -1) return undefined;

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < html.length; i++) {
    const c = html[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (c === '\\') escaped = true;
      else if (c === '"') inString = false;
    } else if (c === '"') {
      inString = true;
    } else if (c === '{') {
      depth++;
    } else if (c === '}' && --depth === 0) {
      return html.slice(start, i + 1);
    }
  }
  return undefined;
}

function toTile(raw: unknown): Tile | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined;
  const t = raw as {
    partNumber?: unknown;
    title?: unknown;
    productDetailsUrl?: unknown;
    price?: { currentPrice?: { raw_amount?: unknown } };
  };
  const price = Number(t.price?.currentPrice?.raw_amount);
  if (
    typeof t.partNumber !== 'string' ||
    typeof t.title !== 'string' ||
    typeof t.productDetailsUrl !== 'string' ||
    !Number.isFinite(price)
  ) {
    return undefined;
  }
  const url = new URL(t.productDetailsUrl, ORIGIN);
  url.search = '';
  return { partNumber: t.partNumber, title: normalizeTitle(t.title), price, url: url.toString() };
}

// Returns every product tile on the page (the whole Mac grid, whichever refurb URL was fetched).
// An empty array means the page did not look like what we expect.
export function parseTiles(html: string): Tile[] {
  const json = extractBootstrapJson(html);
  if (json === undefined) return [];
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    return [];
  }
  const tiles = (data as { tiles?: unknown }).tiles;
  if (!Array.isArray(tiles)) return [];
  return tiles.map(toTile).filter((t): t is Tile => t !== undefined);
}

export function isMatch(tile: Tile, rule: typeof MATCH = MATCH): boolean {
  const title = tile.title.toLowerCase();
  return (
    rule.include.every((s) => title.includes(s.toLowerCase())) &&
    !rule.exclude.some((s) => title.includes(s.toLowerCase())) &&
    tile.price < rule.maxPrice
  );
}
