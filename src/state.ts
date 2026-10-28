import { readFile, writeFile } from 'node:fs/promises';
import type { Tile } from './parse.ts';

export interface Listing {
  title: string;
  price: number;
  url: string;
}

export interface State {
  // True after a "watcher broken" alert has been sent, so it is sent only once until the page parses again.
  broken: boolean;
  // Matching listings we have already alerted on, keyed by Apple part number.
  listings: Record<string, Listing>;
}

const EMPTY: State = { broken: false, listings: {} };

export async function loadState(path: string | URL): Promise<State> {
  try {
    const parsed = JSON.parse(await readFile(path, 'utf8')) as Partial<State>;
    return { broken: parsed.broken ?? false, listings: parsed.listings ?? {} };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return structuredClone(EMPTY);
    throw err;
  }
}

// Stable output (sorted keys, no timestamps) so the workflow only commits when something actually changed.
export function serializeState(state: State): string {
  const listings = Object.fromEntries(
    Object.entries(state.listings).sort(([a], [b]) => a.localeCompare(b)),
  );
  return JSON.stringify({ broken: state.broken, listings }, null, 2) + '\n';
}

export async function saveState(path: string | URL, state: State): Promise<void> {
  await writeFile(path, serializeState(state));
}

export function diffListings(
  seen: Record<string, Listing>,
  current: Tile[],
): { appeared: Tile[]; disappeared: (Listing & { partNumber: string })[] } {
  const currentParts = new Set(current.map((t) => t.partNumber));
  return {
    appeared: current.filter((t) => !(t.partNumber in seen)),
    disappeared: Object.entries(seen)
      .filter(([partNumber]) => !currentParts.has(partNumber))
      .map(([partNumber, listing]) => ({ partNumber, ...listing })),
  };
}
