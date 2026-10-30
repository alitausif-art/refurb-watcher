import { MINI_BUY_PAGE, NEWSROOM_FEED, TIMEOUT_MS, USER_AGENT } from './config.ts';
import { isM7Entry, miniPageHasChipStrings, miniPageHasM7, parseNewsroom, type Entry } from './m7-parse.ts';
import { loadM7State, saveM7State, serializeM7State } from './m7-state.ts';
import { notify, requireTopic, type Message } from './notify.ts';

// Alerts only on Apple-confirmed M7 news: a newsroom press release that mentions M7 (any Mac), and the day
// the Canadian Mac mini buy page lists an M7 chip. Rumours are deliberately out of scope.

const STATE_PATH = new URL('../m7-state.json', import.meta.url);

type Page = { ok: true; body: string } | { ok: false; reason: string };

// 403/429 mean we are being blocked: report as broken. Anything else non-2xx (or a timeout) throws,
// which fails the run without paging anyone.
async function fetchText(url: string, accept: string): Promise<Page> {
  const res = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, Accept: accept, 'Accept-Language': 'en-CA,en;q=0.9' },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (res.status === 403 || res.status === 429) return { ok: false, reason: `HTTP ${res.status} from ${url}` };
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
  return { ok: true, body: await res.text() };
}

const newsMessage = (e: Entry): Message => ({
  title: 'Apple M7 news',
  message: `${e.title}\n${e.updated.slice(0, 10)}\n${e.link}`,
  click: e.link,
  tags: ['newspaper'],
  priority: 4,
});

const miniLiveMessage: Message = {
  title: 'M7 Mac mini is on apple.ca',
  message: `Apple Canada's Mac mini page now lists an M7 chip.\n${MINI_BUY_PAGE}`,
  click: MINI_BUY_PAGE,
  tags: ['tada'],
  priority: 5,
};

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');
  const topic = dryRun ? '' : requireTopic();

  const feed = await fetchText(NEWSROOM_FEED, 'application/atom+xml,application/rss+xml,application/xml;q=0.9,*/*;q=0.8');
  const entries = feed.ok ? parseNewsroom(feed.body) : [];
  const newsroomBroken = !feed.ok ? feed.reason : entries.length === 0 ? `parsed zero entries from ${NEWSROOM_FEED}` : undefined;

  const mini = await fetchText(MINI_BUY_PAGE, 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8');
  const miniBroken = !mini.ok
    ? mini.reason
    : miniPageHasChipStrings(mini.body)
      ? undefined
      : `no "M<n> chip" strings found on ${MINI_BUY_PAGE}`;
  const miniM7 = mini.ok && miniPageHasM7(mini.body);

  if (dryRun) {
    console.log(`Newsroom: ${newsroomBroken ?? `${entries.length} entries`}`);
    for (const e of entries) console.log(`  [${isM7Entry(e) ? 'M7' : '  '}] ${e.updated.slice(0, 10)}  ${e.title}`);
    console.log(`\nMac mini page: ${miniBroken ?? (miniM7 ? 'lists an M7 chip' : 'chip strings found, no M7')}`);
    if (newsroomBroken || miniBroken) process.exitCode = 1;
    return;
  }

  const state = await loadM7State(STATE_PATH);
  const before = serializeM7State(state);
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

  // Each source is handled on its own, so a blocked feed never hides a live Mac mini page or vice versa.
  const source = async (
    name: string,
    broken: string | undefined,
    flag: 'newsroomBroken' | 'miniBroken',
    act: () => Promise<void>,
  ): Promise<void> => {
    if (broken) {
      console.error(`${name} broken: ${broken}`);
      failed = true;
      if (!state[flag]) {
        const sent = await send({
          title: `M7 watcher broken (${name})`,
          message: `${broken}. No further alerts for this source until it parses again.`,
          tags: ['warning'],
          priority: 4,
        });
        if (sent) state[flag] = true;
      }
      return;
    }
    if (state[flag]) {
      const sent = await send({ title: `M7 watcher recovered (${name})`, message: `${name} parses again.`, tags: ['white_check_mark'] });
      if (sent) state[flag] = false;
    }
    await act();
  };

  await source('newsroom', newsroomBroken, 'newsroomBroken', async () => {
    const fresh = entries.filter((e) => isM7Entry(e) && !(e.link in state.newsroom));
    console.log(`Newsroom: ${entries.length} entries, ${fresh.length} new M7 item(s).`);
    // Oldest first, so a burst of announcements arrives in order. Recorded only once the push succeeded.
    for (const e of fresh.reverse()) {
      if (await send(newsMessage(e))) state.newsroom[e.link] = { title: e.title, updated: e.updated };
    }
  });

  await source('Mac mini page', miniBroken, 'miniBroken', async () => {
    console.log(`Mac mini page: ${miniM7 ? 'lists an M7 chip' : 'no M7 yet'}.`);
    if (miniM7 && !state.miniLive && (await send(miniLiveMessage))) state.miniLive = true;
  });

  if (serializeM7State(state) !== before) await saveM7State(STATE_PATH, state);
  if (failed) process.exitCode = 1;
}

main().catch((err: unknown) => {
  console.error(String(err));
  process.exitCode = 1;
});
