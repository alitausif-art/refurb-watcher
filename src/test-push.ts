import { PRIMARY_URL } from './config.ts';
import { notify, requireTopic } from './notify.ts';

// Sends one test notification so you can confirm ntfy reaches your phone.
await notify(requireTopic(), {
  title: 'Refurb watcher test',
  message: `Test push from refurb-watcher. Real alerts look like this:\nRefurbished Mac mini Apple M4 Chip with 10‑Core CPU and 10‑Core GPU\n$1,019.00 CAD\n${PRIMARY_URL}`,
  click: PRIMARY_URL,
  tags: ['test_tube'],
});
console.log('Test push sent.');
