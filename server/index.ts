import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { getDefaultDb } from './db.js';
import { runIndexerOnce, buildSnapshotPayload } from './indexer.js';
import { getPortfolioStats, getPortfolioActivity, getCreatedTokens } from './swapSource.js';
import { normalizeStats, summarizeActivity, computeScores, getWalletTags } from './scorer.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function createLeaderboardApp(targetDb = getDefaultDb()) {
  const app = express();
  app.use(cors());
  app.use(express.static(path.resolve(__dirname, '../public')));

  let snapshotCache: any = null;
  let snapshotTs = 0;
  const SNAPSHOT_TTL = 5000;

  app.get('/api/stats', (_req, res) => {
    const wallets = targetDb.prepare('SELECT COUNT(*) as c FROM wallets').get() as any;
    const feed = targetDb.prepare('SELECT COUNT(*) as c FROM feed').get() as any;
    res.json({ wallets: wallets.c, feed: feed.c });
  });

  app.get('/api/snapshot', (_req, res) => {
    const now = Date.now();
    if (snapshotCache && now - snapshotTs < SNAPSHOT_TTL) {
      return res.json(snapshotCache);
    }
    snapshotCache = buildSnapshotPayload(targetDb);
    snapshotTs = now;
    return res.json(snapshotCache);
  });

  app.get('/api/leaderboard', (req, res) => {
    const limit = parseInt(req.query.limit as string, 10) || 50;
    const sort = (req.query.sort as string) || 'profit';

    const sortFields: Record<string, string> = {
      profit: 'realized_profit DESC',
      winrate: 'win_rate DESC',
      track_score: 'track_score DESC',
      copy_score: 'copy_score DESC',
      ghost_sell_ratio: 'ghost_sell_ratio DESC',
      dump_rate: 'dump_rate DESC',
    };

    const orderBy = sortFields[sort] || sortFields.profit;
    const rows = targetDb.prepare(`SELECT * FROM wallets ORDER BY ${orderBy} LIMIT ?`).all(limit) as any[];
    rows.forEach((r) => {
      r.tags = JSON.parse(r.tags || '[]');
    });
    res.json(rows);
  });

  app.get('/api/wallet/:address', async (req, res) => {
    const addr = req.params.address.toLowerCase();
    let wallet = targetDb.prepare('SELECT * FROM wallets WHERE address = ?').get(addr) as any;

    if (wallet) {
      wallet.tags = JSON.parse(wallet.tags || '[]');
      wallet.score_details = JSON.parse(wallet.score_details || '{}');
    } else {
      const rawStats = await getPortfolioStats(addr);
      if (!rawStats) return res.status(404).json({ error: 'Wallet not found' });
      const rawActivity = await getPortfolioActivity(addr, 100);
      const createdTokens = await getCreatedTokens(addr);

      const w = normalizeStats(rawStats);
      w.created_token_count = Array.isArray(createdTokens?.tokens) ? createdTokens.tokens.length : 0;

      const summ = summarizeActivity(rawActivity);
      const { trackScore, copyScore, details } = computeScores(w, summ);
      const tags = getWalletTags(w, summ, details.isDev);

      wallet = { ...w, track_score: trackScore, copy_score: copyScore, tags, score_details: details };
    }

    const trades = targetDb
      .prepare('SELECT * FROM feed WHERE wallet_address = ? ORDER BY timestamp DESC LIMIT 20')
      .all(addr);

    return res.json({ profile: wallet, trades });
  });

  return app;
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === __filename;
if (isDirectRun) {
  const PORT = Number(process.env.PORT) || 3000;
  const intervalMs = Number(process.env.INDEX_INTERVAL_MS) || 30000;
  const db = getDefaultDb();
  await runIndexerOnce(db);

  const app = createLeaderboardApp(db);
  const server = app.listen(PORT, () => {
    console.log(`[crypto-pnl-leaderboard] Server listening on http://localhost:${PORT}`);
    setInterval(() => {
      runIndexerOnce(db).catch((err) => console.error('[indexer]', err));
    }, intervalMs);
  });

  const shutdown = () => {
    server.close(() => {
      try { db.close(); } catch {}
      process.exit(0);
    });
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}
