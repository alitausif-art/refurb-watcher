import { readFile, writeFile } from 'node:fs/promises';

export interface M7State {
  // True after a "broken" alert for that source went out, so it is sent once until the source parses again.
  newsroomBroken: boolean;
  miniBroken: boolean;
  // True once the "M7 Mac mini is on apple.ca" alert has been sent.
  miniLive: boolean;
  // Newsroom entries already alerted on, keyed by article URL.
  newsroom: Record<string, { title: string; updated: string }>;
}

export const EMPTY_M7_STATE: M7State = { newsroomBroken: false, miniBroken: false, miniLive: false, newsroom: {} };

export async function loadM7State(path: string | URL): Promise<M7State> {
  try {
    const p = JSON.parse(await readFile(path, 'utf8')) as Partial<M7State>;
    return {
      newsroomBroken: p.newsroomBroken ?? false,
      miniBroken: p.miniBroken ?? false,
      miniLive: p.miniLive ?? false,
      newsroom: p.newsroom ?? {},
    };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return structuredClone(EMPTY_M7_STATE);
    throw err;
  }
}

// Stable output (fixed key order, sorted entries, no timestamps) so the workflow only commits real changes.
export function serializeM7State(state: M7State): string {
  const newsroom = Object.fromEntries(Object.entries(state.newsroom).sort(([a], [b]) => a.localeCompare(b)));
  return (
    JSON.stringify(
      { newsroomBroken: state.newsroomBroken, miniBroken: state.miniBroken, miniLive: state.miniLive, newsroom },
      null,
      2,
    ) + '\n'
  );
}

export async function saveM7State(path: string | URL, state: M7State): Promise<void> {
  await writeFile(path, serializeM7State(state));
}
