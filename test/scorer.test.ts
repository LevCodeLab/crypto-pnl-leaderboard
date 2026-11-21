import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openLeaderboardDb } from '../server/db.js';
import { normalizeStats, summarizeActivity, computeScores, getWalletTags } from '../server/scorer.js';
import { runIndexerOnce, buildSnapshotPayload } from '../server/indexer.js';

test('scorer computes roundtrip realized PnL, open unrealized PnL, and flags ghost-sell insiders', () => {
  const nowSec = Math.floor(Date.now() / 1000);

  const cleanStats = normalizeStats({
    wallet_address: '0xabc001',
    realized_profit: '32000',
    unrealized_profit: '0',
    realized_profit_pnl: '0.62',
    buy: 60,
    sell: 55,
    bought_cost: '180000',
    pnl_stat: {
      token_num: 45,
      winrate: 0.72,
      pnl_gt_5x_num: 4,
      pnl_2x_5x_num: 16,
      pnl_0x_2x_num: 15,
      pnl_nd5_0x_num: 8,
      pnl_lt_nd5_num: 2,
      avg_holding_period: 92000,
    },
    common: {
      created_at: nowSec - 86400 * 300,
      follow_count: 80,
    },
  });

  const cleanActivity = summarizeActivity([
    {
      event_type: 'buy',
      timestamp: nowSec - 95000,
      cost_usd: 2000,
      price_usd: 1.0,
      token: { address: '0xtok1', total_supply: 1000000 },
    },
    {
      event_type: 'sell',
      timestamp: nowSec - 1000,
      cost_usd: 3600,
      buy_cost_usd: 2000,
      price_usd: 1.8,
      token: { address: '0xtok1', total_supply: 1000000 },
    },
    {
      event_type: 'buy',
      timestamp: nowSec - 10000,
      cost_usd: 1000,
      price_usd: 2.0,
      mark_price_usd: 3.0,
      token: { address: '0xtok2', total_supply: 1000000 },
    },
  ]);

  assert.equal(cleanActivity.per_trade_pnl, 1600);
  assert.equal(cleanActivity.unrealized_pnl, 500);
  assert.equal(cleanActivity.ghost_sell_ratio, 0);

  const cleanScores = computeScores(cleanStats, cleanActivity);
  assert.ok(cleanScores.trackScore >= 70);
  assert.ok(cleanScores.copyScore >= 60);

  const tags = getWalletTags(cleanStats, cleanActivity, false).map((t) => t.name);
  assert.ok(tags.includes('Conviction Holder'));
  assert.ok(tags.includes('True Alpha'));

  // Fresh ghost-seller wallet gets penalized
  const insiderStats = normalizeStats({
    wallet_address: '0xins999',
    realized_profit: '15000',
    realized_profit_pnl: '0.9',
    buy: 2,
    sell: 10,
    pnl_stat: { token_num: 10, winrate: 0.9 },
    common: { created_at: nowSec - 86400 * 2 },
  });
  const insiderSumm = summarizeActivity([
    { event_type: 'sell', timestamp: nowSec - 100, cost_usd: 9000, buy_cost_usd: 0, token: { address: '0xtokA' } },
    { event_type: 'sell', timestamp: nowSec - 50, cost_usd: 6000, buy_cost_usd: 0, token: { address: '0xtokB' } },
  ]);
  const insiderScores = computeScores(insiderStats, insiderSumm);
  assert.ok(insiderScores.trackScore <= 30);
});

test('SQLite in-memory indexer populates wallets, feed, and snapshot JSON cleanly', async () => {
  const memDb = openLeaderboardDb(':memory:');
  try {
    await runIndexerOnce(memDb);
    const snapshot = buildSnapshotPayload(memDb);
    assert.ok(snapshot.leaderboard.length >= 3);
    assert.ok(snapshot.feed.length >= 3);
    assert.ok(snapshot.stats.wallets >= 3);
  } finally {
    memDb.close();
  }
});
