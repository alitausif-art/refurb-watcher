import { NTFY_SERVER, TIMEOUT_MS } from './config.ts';

export interface Message {
  title: string;
  message: string;
  click?: string;
  tags?: string[];
  priority?: 1 | 2 | 3 | 4 | 5;
}

const cad = new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' });

export function formatPrice(price: number): string {
  return `${cad.format(price)} CAD`;
}

// JSON publishing rather than headers: Apple titles contain non-Latin-1 characters,
// which fetch rejects in header values.
export async function notify(topic: string, msg: Message): Promise<void> {
  const res = await fetch(NTFY_SERVER, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ topic, ...msg }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`ntfy responded HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
}

export function requireTopic(): string {
  const topic = process.env.NTFY_TOPIC?.trim();
  if (!topic) throw new Error('NTFY_TOPIC is not set');
  return topic;
}
