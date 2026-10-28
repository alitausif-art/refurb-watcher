import { test } from 'node:test';
import assert from 'node:assert/strict';
import { diffListings } from '../src/state.ts';
import type { Tile } from '../src/parse.ts';

const tile = (partNumber: string, price = 1019): Tile => ({
  partNumber,
  title: `Refurbished Mac mini Apple M4 Chip ${partNumber}`,
  price,
  url: `https://www.apple.com/ca/shop/product/${partNumber}`,
});

test('first sighting is reported as appeared', () => {
  const { appeared, disappeared } = diffListings({}, [tile('A')]);
  assert.deepEqual(appeared.map((t) => t.partNumber), ['A']);
  assert.deepEqual(disappeared, []);
});

test('a listing already seen is not reported again, even if its price changes', () => {
  const seen = { A: { title: 't', price: 1019, url: 'u' } };
  const { appeared, disappeared } = diffListings(seen, [tile('A', 999)]);
  assert.deepEqual(appeared, []);
  assert.deepEqual(disappeared, []);
});

test('a seen listing missing from the current matches is reported as disappeared', () => {
  const seen = { A: { title: 'tA', price: 1019, url: 'uA' }, B: { title: 'tB', price: 1099, url: 'uB' } };
  const { appeared, disappeared } = diffListings(seen, [tile('B'), tile('C')]);
  assert.deepEqual(appeared.map((t) => t.partNumber), ['C']);
  assert.deepEqual(disappeared, [{ partNumber: 'A', title: 'tA', price: 1019, url: 'uA' }]);
});
