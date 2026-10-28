import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isMatch, parseTiles } from '../src/parse.ts';

const html = readFileSync(new URL('./fixtures/grid.html', import.meta.url), 'utf8');

test('parseTiles reads every well-formed tile from the bootstrap JSON', () => {
  const tiles = parseTiles(html);
  assert.deepEqual(
    tiles.map((t) => t.partNumber),
    ['FAKE1LL/A', 'FAKE2LL/A', 'FAKE3LL/A', 'FAKE4LL/A', 'FAKE5LL/A'],
  );
});

test('parseTiles normalizes title, uses raw price, and strips the fnode tracking param', () => {
  const [first] = parseTiles(html);
  assert.deepEqual(first, {
    partNumber: 'FAKE1LL/A',
    title: 'Refurbished Mac mini Apple M4 Chip with 10-Core CPU and 10-Core GPU',
    price: 1019,
    url: 'https://www.apple.com/ca/shop/product/fake1ll/a/refurbished-mac-mini-apple-m4-chip',
  });
  // The display amount carries a hidden "Now" span on sale items; the raw amount does not.
  assert.equal(parseTiles(html).find((t) => t.partNumber === 'FAKE3LL/A')?.price, 1309);
});

test('parseTiles returns [] when the bootstrap is missing or malformed', () => {
  assert.deepEqual(parseTiles('<html><body>Access denied</body></html>'), []);
  assert.deepEqual(parseTiles('<script>window.REFURB_GRID_BOOTSTRAP = {"tiles": [</script>'), []);
});

test('isMatch: M4 (not Pro) Mac mini strictly under the price limit, case-insensitive', () => {
  const byPart = new Map(parseTiles(html).map((t) => [t.partNumber, t]));
  const matched = [...byPart.values()].filter((t) => isMatch(t)).map((t) => t.partNumber);
  // FAKE2 is M4 Pro, FAKE3 is over the limit, FAKE5 is an iMac.
  assert.deepEqual(matched, ['FAKE1LL/A', 'FAKE4LL/A']);
});

test('isMatch: price equal to the limit does not match', () => {
  const tile = { partNumber: 'X', title: 'Refurbished Mac mini Apple M4 Chip', price: 1300, url: 'u' };
  assert.equal(isMatch(tile), false);
  assert.equal(isMatch({ ...tile, price: 1299.99 }), true);
});
