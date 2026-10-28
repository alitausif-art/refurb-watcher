// Everything you are likely to want to change lives here.

export const PRIMARY_URL = 'https://www.apple.com/ca/shop/refurbished/mac/mac-mini';
// Only fetched when PRIMARY_URL returns 404.
export const FALLBACK_URL = 'https://www.apple.com/ca/shop/refurbished/mac';

export const MATCH = {
  // Case-insensitive; the title must contain every `include` string and none of the `exclude` strings.
  include: ['Mac mini Apple M4 Chip'],
  exclude: ['M4 Pro'],
  // Strictly below this price, in CAD.
  maxPrice: 1300,
};

export const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15';

export const TIMEOUT_MS = 20_000;

export const NTFY_SERVER = process.env.NTFY_SERVER ?? 'https://ntfy.sh';
