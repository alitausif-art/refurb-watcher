import { FALLBACK_URL, MATCH, PRIMARY_URL, TIMEOUT_MS, USER_AGENT } from './config.ts';
import { formatPrice, notify, requireTopic, type Message } from './notify.ts';
import { isMatch, parseTiles, type Tile } from './parse.ts';
import { diffListings, loadState, saveState, serializeState, type Listing } from './state.ts';

const STATE_PATH = new URL('../state.json', import.meta.url);

type Page = { ok: true; url: string; html: string } | { ok: false; reason: string };

function get(url: string): Promise<Response> {
  return fetch(url, {
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-CA,en;q=0.9',
    },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
}

// One request per run; the fallback page is only fetched if the primary URL is gone (404).
// 403/429 mean we are being blocked: report as broken. Anything else non-2xx (or a timeout)
// throws, which fails the run without paging anyone.
async function fetchPage(): Promise<Page> {
  let url = PRIMARY_URL;
  let res = await get(url);
  if (res.status === 404) {
    url = FALLBACK_URL;
    res = await get(url);
  }
  if (res.status === 403 || res.status === 429) return { ok: false, reason: `HTTP ${res.status} from ${url}` };
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
  return { ok: true, url, html: await res.text() };
}

function listingLines(l: Listing): string {
  return `${l.title}\n${formatPrice(l.price)}\n${l.url}`;
}

const appearedMessage = (t: Tile): Message => ({
  title: 'Refurb match in stock',
  message: listingLines(t),
  click: t.url,
  tags: ['tada'],
  priority: 5,
});

const goneMessage = (l: Listing): Message => ({
  title: 'Refurb match gone',
  message: listingLines(l),
  click: l.url,
  tags: ['x'],
});

function printDryRun(page: Page, tiles: Tile[]): void {
  if (!page.ok) {
    console.log(`Fetch blocked: ${page.reason}`);
    return;
  }
  console.log(`Fetched ${page.url}`);
  console.log(`Parsed ${tiles.length} product tiles (whole refurbished Mac grid).`);
  const minis = tiles.filter((t) => t.title.toLowerCase().includes('mac mini'));
  console.log(`\nMac mini tiles (${minis.length}):`);
  for (const t of minis) {
    console.log(`  [${isMatch(t) ? 'MATCH' : '     '}] ${formatPrice(t.price).padStart(16)}  ${t.title}\n${' '.repeat(27)}${t.url}`);
  }
  const matches = tiles.filter((t) => isMatch(t));
  console.log(
    `\nMatches for include=${JSON.stringify(MATCH.include)} exclude=${JSON.stringify(MATCH.exclude)} price<${MATCH.maxPrice}: ${matches.length}`,
  );
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');
  const topic = dryRun ? '' : requireTopic();

  const page = await fetchPage();
  const tiles = page.ok ? parseTiles(page.html) : [];
  const brokenReason = !page.ok
    ? page.reason
    : tiles.length === 0
      ? `parsed zero product tiles from ${page.url}`
      : undefined;

  if (dryRun) {
    printDryRun(page, tiles);
    if (brokenReason) process.exitCode = 1;
    return;
  }

  const state = await loadState(STATE_PATH);
  const before = serializeState(state);
  let failed = false;

  const send = async (msg: Message): Promise<boolean> => {
    try {
      await notify(topic, msg);
      console.log(`Sent: ${msg.title} — ${msg.message.split('\n')[0]}`);
      return true;
    } catch (err) {
      console.error(`Failed to send "${msg.title}": ${String(err)}`);
      failed = true;
      return false;
    }
  };

  if (brokenReason) {
    // Leave listings untouched so a bad page can't produce false "gone" alerts.
    console.error(`Watcher broken: ${brokenReason}`);
    failed = true;
    if (!state.broken) {
      const sent = await send({
        title: 'Refurb watcher broken',
        message: `${brokenReason}. No further alerts until it parses again.`,
        tags: ['warning'],
        priority: 4,
      });
      if (sent) state.broken = true;
    }
  } else {
    if (state.broken) {
      const sent = await send({
        title: 'Refurb watcher recovered',
        message: `Parsing ${tiles.length} tiles again from ${page.ok ? page.url : ''}`,
        tags: ['white_check_mark'],
      });
      if (sent) state.broken = false;
    }

    const matches = tiles.filter((t) => isMatch(t));
    console.log(`Parsed ${tiles.length} tiles, ${matches.length} matching.`);

    // A listing is recorded (or forgotten) only once its alert went out, so a failed push is retried next run.
    const { appeared, disappeared } = diffListings(state.listings, matches);
    for (const t of appeared) {
      if (await send(appearedMessage(t))) {
        state.listings[t.partNumber] = { title: t.title, price: t.price, url: t.url };
      }
    }
    for (const l of disappeared) {
      if (await send(goneMessage(l))) delete state.listings[l.partNumber];
    }
  }

  if (serializeState(state) !== before) await saveState(STATE_PATH, state);
  if (failed) process.exitCode = 1;
}

main().catch((err: unknown) => {
  console.error(String(err));
  process.exitCode = 1;
});
