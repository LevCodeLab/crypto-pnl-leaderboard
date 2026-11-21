/**
 * Score a single sample wallet directly from TypeScript.
 * Run with: npx tsx examples/score-single-wallet.ts
 */
import { normalizeStats, summarizeActivity, computeScores, getWalletTags } from '../server/scorer.js';

const stats = normalizeStats({
  wallet_address: '0x123400000000000000000000000000000000abcd',
  realized_profit: '24500',
  realized_profit_pnl: '0.55',
  buy: 50,
  sell: 48,
  bought_cost: '140000',
  pnl_stat: { token_num: 40, winrate: 0.68, pnl_2x_5x_num: 18, pnl_0x_2x_num: 12 },
});

const summary = summarizeActivity([
  { event_type: 'buy', timestamp: 1000, cost_usd: 2000, price_usd: 1.0, token: { address: '0x01' } },
  { event_type: 'sell', timestamp: 90000, cost_usd: 3800, buy_cost_usd: 2000, price_usd: 1.9, token: { address: '0x01' } },
]);

const scores = computeScores(stats, summary);
const tags = getWalletTags(stats, summary, false);
console.log({ scores, tags });
