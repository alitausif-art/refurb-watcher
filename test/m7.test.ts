import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isM7Entry, miniPageHasChipStrings, miniPageHasM7, parseNewsroom } from '../src/m7-parse.ts';
import { EMPTY_M7_STATE, serializeM7State } from '../src/m7-state.ts';

const feed = readFileSync(new URL('./fixtures/newsroom.atom', import.meta.url), 'utf8');
const miniPage = readFileSync(new URL('./fixtures/mac-mini.html', import.meta.url), 'utf8');

test('parseNewsroom reads every entry, trims CDATA titles and skips image enclosure links', () => {
  const entries = parseNewsroom(feed);
  assert.equal(entries.length, 5);
  assert.deepEqual(entries[1], {
    title: 'Apple introduces the new 14-inch MacBook Pro with M6',
    link: 'https://www.apple.com/newsroom/2026/10/apple-introduces-the-new-14-inch-macbook-pro-with-m6/',
    updated: '2026-10-27T12:59:39.082Z',
    summary: entries[1]?.summary ?? '',
  });
  assert.equal(entries[2]?.link, 'https://www.apple.com/newsroom/2027/03/apple-introduces-the-all-new-macbook-pro-with-m7/');
  assert.ok(!entries.some((e) => e.link.includes('/images/')));
});

test('parseNewsroom returns [] for a page that is not the feed', () => {
  assert.deepEqual(parseNewsroom('<html><body>Access denied</body></html>'), []);
});

test('isM7Entry matches M7 as a word in the title or summary, not M6 or M70', () => {
  const matched = parseNewsroom(feed).filter(isM7Entry).map((e) => e.title);
  assert.deepEqual(matched, [
    'Apple introduces the all-new MacBook Pro with M7',
    'Apple Watch adds a new workout view', // M7 Pro / M7 Max mentioned in the body only
  ]);
});

test('Mac mini page: chip strings are recognised, M7 is not reported until Apple lists it', () => {
  assert.equal(miniPageHasChipStrings(miniPage), true);
  assert.equal(miniPageHasM7(miniPage), false); // the "/M7/" asset path must not count
  assert.equal(miniPageHasChipStrings('<html><body>Access denied</body></html>'), false);
});

test('Mac mini page: an M7 configuration or description triggers', () => {
  assert.equal(miniPageHasM7(miniPage.replace('Mac mini, M6 Chip, 12-core CPU, 12-core GPU, 32GB', 'Mac mini, M7 Chip, 12-core CPU, 12-core GPU, 32GB')), true);
  assert.equal(miniPageHasM7(miniPage.replace('M5 Pro Chip', 'M7&nbsp;Pro Chip')), true);
  assert.equal(miniPageHasM7(miniPage.replace('Mac mini with the M6 or M5 Pro chip', 'Mac mini with the M7 or M6 Pro chip')), true);
});

test('serializeM7State is stable: fixed key order, sorted entries, trailing newline', () => {
  const a = serializeM7State({
    ...EMPTY_M7_STATE,
    newsroom: { 'https://b.example/': { title: 'B', updated: '' }, 'https://a.example/': { title: 'A', updated: '' } },
  });
  const b = serializeM7State({
    ...EMPTY_M7_STATE,
    newsroom: { 'https://a.example/': { title: 'A', updated: '' }, 'https://b.example/': { title: 'B', updated: '' } },
  });
  assert.equal(a, b);
  assert.ok(a.endsWith('}\n'));
  assert.equal(serializeM7State(EMPTY_M7_STATE), '{\n  "newsroomBroken": false,\n  "miniBroken": false,\n  "miniLive": false,\n  "newsroom": {}\n}\n');
});
