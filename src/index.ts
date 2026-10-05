import { bot } from './bot.ts';

if (!process.env.DISCORD_TOKEN?.trim()) {
  throw new Error('Set DISCORD_TOKEN in .env before starting Pascal.');
}

await bot.start();

let stopping = false;
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    if (stopping) return;
    stopping = true;
    void bot.stop().then(() => process.exit(0)).catch((error: unknown) => {
      console.error('Pascal could not shut down cleanly.', error);
      process.exit(1);
    });
  });
}
