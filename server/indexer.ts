import type Database from 'better-sqlite3';
import {
  getActivePools,
  getTopTraders,
  getPortfolioStats,
  getPortfolioActivity,
  getCreatedTokens,
} from './swapSource.js';
import { getDefaultDb } from './db.js';
import { normalizeStats, summarizeActivity, computeScores, getWalletTags } from './scorer.js';

const STALE_MS = 60 * 60 * 1000;

export async function runIndexerOnce(targetDb: Database.Database = getDefaultDb()) {
  const checkWalletStmt = targetDb.prepare('SELECT last_updated FROM wallets WHERE address = ?');
  const incrementScanStmt = targetDb.prepare('UPDATE wallets SET scan_count = scan_count + 1 WHERE address = ?');
  const upsertWalletStmt = targetDb.prepare(`
    INSERT INTO wallets (
      address, name, tags, realized_profit, unrealized_profit, roi, win_rate, trades, token_num,
      track_score, copy_score, avg_buy_usd, avg_hold_s,
      dump_rate, avg_real_hold_s, wallet_age_days, follower_count,
      ghost_sell_ratio, uncopyable_rate, avg_price_impact,
      score_details,
      discovered_from, first_seen, last_updated, scan_count,
      volume_weighted_hold_s, median_entry_mcap, sell_pattern
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
    ON CONFLICT(address) DO UPDATE SET
      name=excluded.name, tags=excluded.tags,
      realized_profit=excluded.realized_profit,
      unrealized_profit=excluded.unrealized_profit,
      roi=excluded.roi, win_rate=excluded.win_rate, trades=excluded.trades,
      token_num=excluded.token_num, track_score=excluded.track_score,
      copy_score=excluded.copy_score, avg_buy_usd=excluded.avg_buy_usd,
      avg_hold_s=excluded.avg_hold_s, dump_rate=excluded.dump_rate,
      avg_real_hold_s=excluded.avg_real_hold_s, wallet_age_days=excluded.wallet_age_days,
      follower_count=excluded.follower_count, ghost_sell_ratio=excluded.ghost_sell_ratio,
      uncopyable_rate=excluded.uncopyable_rate, avg_price_impact=excluded.avg_price_impact,
      score_details=excluded.score_details,
      last_updated=excluded.last_updated,
      first_seen = CASE WHEN wallets.first_seen = 0 THEN excluded.first_seen ELSE wallets.first_seen END,
      volume_weighted_hold_s=excluded.volume_weighted_hold_s,
      median_entry_mcap=excluded.median_entry_mcap,
      sell_pattern=excluded.sell_pattern
  `);

  const insertFeedStmt = targetDb.prepare(`
    INSERT OR IGNORE INTO feed (wallet_address, action, token_address, token_name, token_symbol, amount_usd, timestamp, token_logo, token_mcap)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const pruneFeedStmt = targetDb.prepare('DELETE FROM feed WHERE timestamp < ?');

  const [trendingRes, graduatedRes, newRes] = await Promise.all([
    getActivePools('trending', 5),
    getActivePools('graduated', 5),
    getActivePools('new_pairs', 5),
  ]);

  const tokens = [
    ...(Array.isArray(trendingRes?.trending) ? trendingRes.trending : []),
    ...(Array.isArray(graduatedRes?.graduated) ? graduatedRes.graduated : []),
    ...(Array.isArray(newRes?.new_pairs) ? newRes.new_pairs : []),
  ].slice(0, 10);

  for (const token of tokens) {
    if (!token?.address) continue;
    const topTraders = await getTopTraders(token.address, 10);

    for (const trader of topTraders) {
      if (!trader?.address) continue;
      const lowerAddr = trader.address.toLowerCase();
      const isBurnAddress = lowerAddr.endsWith('dead') || lowerAddr.endsWith('0000');
      if (trader.addr_type !== 0 || isBurnAddress) continue;

      const existing = checkWalletStmt.get(lowerAddr) as { last_updated: number } | undefined;
      const isFresh = existing && Date.now() - existing.last_updated < STALE_MS;

      let rawActivity: any[] = [];

      if (isFresh) {
        incrementScanStmt.run(lowerAddr);
        rawActivity = await getPortfolioActivity(lowerAddr, 10);
      } else {
        const [rawStats, acts, createdTokens] = await Promise.all([
          getPortfolioStats(lowerAddr),
          getPortfolioActivity(lowerAddr, 100),
          getCreatedTokens(lowerAddr),
        ]);
        rawActivity = acts;
        if (!rawStats || rawStats.realized_profit === undefined) continue;

        const w = normalizeStats(rawStats);
        w.address = lowerAddr;
        w.created_token_count = Array.isArray(createdTokens?.tokens) ? createdTokens.tokens.length : 0;

        const summ = summarizeActivity(rawActivity);
        if (summ.avg_real_hold_s < 60 || w.roi < 0.2) {
          targetDb.prepare('DELETE FROM feed WHERE wallet_address = ?').run(w.address);
          targetDb.prepare('DELETE FROM wallets WHERE address = ?').run(w.address);
          continue;
        }

        const { trackScore, copyScore, details } = computeScores(w, summ);
        const tags = getWalletTags(w, summ, details.isDev);
        const unrealizedTotal = w.unrealized_profit || summ.unrealized_pnl || 0;

        upsertWalletStmt.run(
          w.address,
          w.name,
          JSON.stringify(tags),
          w.realized_profit,
          unrealizedTotal,
          w.roi,
          w.winrate,
          w.trades,
          w.token_num,
          trackScore,
          copyScore,
          w.avg_buy_usd,
          w.avg_hold_s,
          summ.fast_dump_rate,
          summ.avg_real_hold_s,
          w.wallet_age_days,
          w.follower_count,
          summ.ghost_sell_ratio,
          summ.uncopyable_rate,
          summ.avg_price_impact,
          JSON.stringify(details),
          token.symbol,
          Date.now(),
          Date.now(),
          summ.volume_weighted_hold_s,
          summ.median_entry_mcap,
          JSON.stringify({ sell_tx_per_token: summ.sell_tx_per_token, dist: summ.custom_dist })
        );
      }

      for (const act of rawActivity.slice(0, 4)) {
        if (act.event_type !== 'buy' && act.event_type !== 'sell') continue;
        const amountUsd = parseFloat(act.cost_usd || act.quote_amount || act.price_usd) || 0;
        const price = parseFloat(act.price_usd) || 0;
        const supply = parseFloat(act.token?.total_supply) || 0;
        const mcap = price * supply;
        if (mcap < 5000 || amountUsd < 10) continue;

        insertFeedStmt.run(
          lowerAddr,
          act.event_type,
          act.token?.address || '',
          act.token?.name || '',
          act.token?.symbol || '',
          amountUsd,
          parseFloat(act.timestamp) || 0,
          act.token?.logo || '',
          mcap
        );
      }
    }
  }

  const threeDaysAgo = Math.floor((Date.now() - 3 * 24 * 60 * 60 * 1000) / 1000);
  pruneFeedStmt.run(threeDaysAgo);
}

export function buildSnapshotPayload(targetDb: Database.Database = getDefaultDb()) {
  const leaderboard = targetDb
    .prepare('SELECT * FROM wallets ORDER BY track_score DESC LIMIT 50')
    .all() as any[];
  leaderboard.forEach((r) => {
    r.tags = JSON.parse(r.tags || '[]');
    r.score_details = JSON.parse(r.score_details || '{}');
  });

  const feedRows = targetDb
    .prepare(`
      SELECT f1.*, w.tags, w.name as wallet_name, w.track_score, w.copy_score,
             w.realized_profit, w.unrealized_profit, w.roi, w.win_rate, w.ghost_sell_ratio, w.dump_rate,
             w.avg_real_hold_s, w.uncopyable_rate, w.avg_price_impact,
             w.median_entry_mcap, w.sell_pattern
      FROM feed f1
      JOIN (
        SELECT MAX(id) as max_id
        FROM feed
        GROUP BY wallet_address, token_address, action
      ) f2 ON f1.id = f2.max_id
      JOIN wallets w ON f1.wallet_address = w.address
      ORDER BY f1.timestamp DESC
      LIMIT 40
    `)
    .all() as any[];

  const mcapStmt = targetDb.prepare('SELECT token_mcap FROM feed WHERE token_address = ? ORDER BY timestamp ASC');
  feedRows.forEach((r) => {
    try { r.tags = JSON.parse(r.tags || '[]'); } catch { r.tags = []; }
    try { r.sell_pattern = JSON.parse(r.sell_pattern || '{}'); } catch { r.sell_pattern = {}; }
    const history = mcapStmt.all(r.token_address) as any[];
    r.mcap_history = history.map((h) => h.token_mcap);
  });

  const topWallets = targetDb
    .prepare(
      'SELECT address, name, realized_profit, unrealized_profit, win_rate, track_score, copy_score, tags, avg_real_hold_s, dump_rate, token_num, trades FROM wallets WHERE copy_score >= 40 ORDER BY copy_score DESC LIMIT 6'
    )
    .all() as any[];
  topWallets.forEach((r) => {
    r.tags = JSON.parse(r.tags || '[]');
  });

  const stats = targetDb.prepare('SELECT COUNT(*) as wallets FROM wallets').get() as any;
  const feedCount = targetDb.prepare('SELECT COUNT(*) as c FROM feed').get() as any;

  return {
    leaderboard,
    feed: feedRows,
    topWallets,
    stats: { wallets: stats.wallets, feed: feedCount.c },
    ts: Date.now(),
  };
}
