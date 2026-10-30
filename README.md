# refurb-watcher

Two small watchers that run from GitHub Actions and push to your phone through [ntfy](https://ntfy.sh):

- **M7 watcher** (`m7.yml`, active) — alerts on Apple-confirmed M7 news: a [newsroom](https://www.apple.com/newsroom/) press release that mentions M7 (any Mac), and the day the [Canadian Mac mini buy page](https://www.apple.com/ca/shop/buy-mac/mac-mini) lists an M7 chip. See [M7 watcher](#m7-watcher).
- **Refurb watcher** (`watch.yml`, paused since 2026-10-30 — the M4 Mac mini was bought) — alerts when a matching listing appears on the Apple Canada refurbished store. Described below; to resume, restore the `schedule:` block in `watch.yml`.

## M7 watcher

Runs twice a day (`17 14,23 * * *` UTC: 07:17 and 16:17 Calgary time in winter, an hour later in summer). One request to Apple's newsroom Atom feed and one to the Mac mini buy page per run. Rumours are out of scope on purpose; only Apple's own publications count, so expect silence until Apple says something.

| Situation | What happens |
|---|---|
| A newsroom entry mentions **M7** (title or summary; "M7", "M7 Pro", "M7 Max", "M7 Ultra") | One "Apple M7 news" push per entry, with the article link. Remembered in `m7-state.json`, so each entry alerts once. |
| The Mac mini buy page lists an **M7** configuration or describes the mini as having M7 | One "M7 Mac mini is on apple.ca" push, high priority. Sent once. |
| Feed or page answers 403/429, the feed parses to zero entries, or the page has no "M<n> chip" strings at all | One "M7 watcher broken (source)" push, run fails, no repeats while it stays broken, "recovered" push when it parses again. The two sources are tracked separately. |
| Timeout, network error, other HTTP error | Run fails with no push (GitHub emails you about failed runs). Next run tries again. |

```bash
npm run m7:dry-run   # fetch both sources, print every newsroom entry (M7 ones flagged) and the mini page status; sends nothing
```

To watch for a different chip or product, edit `M7`/`M7_CHIP` in [`src/m7-parse.ts`](src/m7-parse.ts) and the two URLs in [`src/config.ts`](src/config.ts).

## Refurb watcher

Watches the [Apple Canada refurbished Mac mini page](https://www.apple.com/ca/shop/refurbished/mac/mac-mini) every 5 minutes from GitHub Actions and pushes a notification to your phone through [ntfy](https://ntfy.sh) when a matching listing appears, and again when it disappears.

Default match: title contains **"Mac mini Apple M4 Chip"**, does **not** contain **"M4 Pro"**, price **under $1,300 CAD**.

## How it works

- One HTTP request per run to the Mac mini refurb page (realistic browser User-Agent, 20 s timeout). The page embeds the whole refurbished Mac grid as JSON (`window.REFURB_GRID_BOOTSTRAP`). The watcher reads every tile from that JSON and filters by title and price. If the Mac mini URL ever returns 404, it fetches `/ca/shop/refurbished/mac` instead. That is the only case with a second request.
- Listings already alerted on are kept in [`state.json`](state.json), keyed by Apple part number. The workflow commits it back only when it changes. A listing is recorded only after its push succeeds, so a failed push is retried on the next run.
- Runtime is plain Node 22 TypeScript (type stripping), with no runtime dependencies. `typescript` and `@types/node` are dev-only, for type checking in CI.

| Situation | What happens |
|---|---|
| Matching listing appears | One "Refurb match in stock" push: title, price, product link (tap opens it) |
| Matching listing disappears (sold, removed, or price rises over the limit) | One "Refurb match gone" push |
| Apple answers 403/429, or the page parses to zero tiles | One "Refurb watcher broken" push, run fails. No repeat pushes while it stays broken, and seen listings are left alone. A "recovered" push follows when it parses again. |
| Timeout, network error, other HTTP error | Run fails with no push (GitHub emails you about failed runs). Next run tries again. No retry loops. |

Workflows:

- [`watch.yml`](.github/workflows/watch.yml) ran on cron `*/5 * * * *` (currently paused; `workflow_dispatch` still works). GitHub's scheduler is best-effort, so expect runs to sometimes be several minutes late.
- [`m7.yml`](.github/workflows/m7.yml) runs twice daily; see [M7 watcher](#m7-watcher).
- [`keepalive.yml`](.github/workflows/keepalive.yml) runs weekly. It commits `.keepalive` so GitHub doesn't disable the schedules after 60 days without activity, and re-enables `m7.yml` via the API as a backup.
- [`check.yml`](.github/workflows/check.yml) runs the typecheck and tests on push.

`watch`, `m7` and `keepalive` share the concurrency group `refurb-state`, so they never overlap or race on the state files.

## Setup

### 1. ntfy on your iPhone

1. Install **ntfy** from the App Store (publisher: Philipp Heckel).
2. Open it, allow notifications when asked, and tap **+**.
3. Enter your topic name and keep the default server `https://ntfy.sh`. Tap **Subscribe**.

ntfy.sh topics have no password, so anyone who knows the name can read and post to it. Use a long random name, e.g. `refurb-` followed by the output of `openssl rand -hex 8`.

### 2. The `NTFY_TOPIC` secret

With the [GitHub CLI](https://cli.github.com), from the repo folder:

```bash
gh secret set NTFY_TOPIC
```

Paste the topic name when prompted. Or use the web UI: **Settings → Secrets and variables → Actions → New repository secret**, name `NTFY_TOPIC`.

### 3. Check it

```bash
NTFY_TOPIC=your-topic npm run test-push
```

```bash
npm run dry-run
```

`test-push` sends one test notification to your phone. `dry-run` fetches the live page and prints the Mac mini tiles and matches. It sends nothing and leaves `state.json` alone. Then trigger a real run with `gh workflow run watch` (or **Actions → watch → Run workflow**).

## Changing the match or price threshold

Edit [`src/config.ts`](src/config.ts):

```ts
export const MATCH = {
  include: ['Mac mini Apple M4 Chip'], // all must appear in the title (case-insensitive)
  exclude: ['M4 Pro'],                 // none may appear
  maxPrice: 1300,                      // CAD, strictly below
};
```

Commit and push, e.g. `git commit -am "feat(config): raise price limit to 1500"`. The next run uses the new rule. Seen listings that no longer match get a "gone" push, and newly matching ones get an "in stock" push. Run `npm run dry-run` first to see what the new rule would match today.

To watch a different category, change `PRIMARY_URL`/`FALLBACK_URL` in the same file. Any `apple.com/ca/shop/refurbished/...` page carries the same JSON.

## Development

Requires Node ≥ 22.18.

```bash
npm install
```

```bash
npm test && npm run typecheck
```

Commits follow [Conventional Commits](https://www.conventionalcommits.org).
