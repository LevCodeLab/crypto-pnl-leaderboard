import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function openLeaderboardDb(customPath?: string): Database.Database {
  const resolvedPath = customPath || process.env.DB_PATH || path.resolve(__dirname, '../data/leaderboard.db');

  if (resolvedPath !== ':memory:') {
    const dir = path.dirname(resolvedPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  const database = new Database(resolvedPath);
  if (resolvedPath !== ':memory:') {
    database.pragma('journal_mode = WAL');
  }

  database.exec(`
    CREATE TABLE IF NOT EXISTS wallets (
      address TEXT PRIMARY KEY,
      name TEXT DEFAULT '',
      tags TEXT DEFAULT '[]',
      realized_profit REAL DEFAULT 0,
      unrealized_profit REAL DEFAULT 0,
      roi REAL DEFAULT 0,
      win_rate REAL DEFAULT 0,
      trades INTEGER DEFAULT 0,
      token_num INTEGER DEFAULT 0,
      track_score INTEGER DEFAULT 0,
      copy_score INTEGER DEFAULT 0,
      avg_buy_usd REAL DEFAULT 0,
      avg_hold_s REAL DEFAULT 0,
      dump_rate REAL DEFAULT 0,
      avg_real_hold_s REAL DEFAULT 0,
      wallet_age_days INTEGER DEFAULT 0,
      follower_count INTEGER DEFAULT 0,
      ghost_sell_ratio REAL DEFAULT 0,
      uncopyable_rate REAL DEFAULT 0,
      avg_price_impact REAL DEFAULT 0,
      score_details TEXT DEFAULT '{}',
      discovered_from TEXT DEFAULT '',
      first_seen INTEGER DEFAULT 0,
      last_updated INTEGER DEFAULT 0,
      scan_count INTEGER DEFAULT 0,
      volume_weighted_hold_s REAL DEFAULT 0,
      median_entry_mcap REAL DEFAULT 0,
      sell_pattern TEXT DEFAULT '{}'
    );

    CREATE TABLE IF NOT EXISTS feed (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      wallet_address TEXT,
      action TEXT,
      token_address TEXT,
      token_name TEXT,
      token_symbol TEXT,
      amount_usd REAL,
      timestamp INTEGER,
      token_logo TEXT DEFAULT '',
      token_mcap REAL DEFAULT 0,
      FOREIGN KEY(wallet_address) REFERENCES wallets(address)
    );

    CREATE TABLE IF NOT EXISTS scan_state (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_wallets_profit ON wallets(realized_profit DESC);
    CREATE INDEX IF NOT EXISTS idx_wallets_track ON wallets(track_score DESC);
    CREATE INDEX IF NOT EXISTS idx_wallets_copy ON wallets(copy_score DESC);
    CREATE INDEX IF NOT EXISTS idx_wallets_winrate ON wallets(win_rate DESC);
    CREATE INDEX IF NOT EXISTS idx_wallets_ghost ON wallets(ghost_sell_ratio DESC);
    CREATE INDEX IF NOT EXISTS idx_wallets_dump ON wallets(dump_rate DESC);
    CREATE INDEX IF NOT EXISTS idx_feed_timestamp ON feed(timestamp DESC);
    CREATE INDEX IF NOT EXISTS idx_feed_group ON feed(wallet_address, token_address, action, id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_feed_unique ON feed(wallet_address, token_address, action, timestamp);
  `);

  return database;
}

let defaultDbInstance: Database.Database | null = null;

export function getDefaultDb(): Database.Database {
  if (!defaultDbInstance) {
    defaultDbInstance = openLeaderboardDb();
  }
  return defaultDbInstance;
}

export interface Wallet {
  address: string;
  name: string;
  tags: string;
  realized_profit: number;
  unrealized_profit: number;
  roi: number;
  win_rate: number;
  trades: number;
  token_num: number;
  track_score: number;
  copy_score: number;
  avg_buy_usd: number;
  avg_hold_s: number;
  dump_rate: number;
  avg_real_hold_s: number;
  wallet_age_days: number;
  follower_count: number;
  ghost_sell_ratio: number;
  uncopyable_rate: number;
  avg_price_impact: number;
  score_details: string;
  discovered_from: string;
  first_seen: number;
  last_updated: number;
  scan_count: number;
  volume_weighted_hold_s: number;
  median_entry_mcap: number;
  sell_pattern: string;
}

export interface FeedItem {
  id?: number;
  wallet_address: string;
  action: string;
  token_address: string;
  token_name: string;
  token_symbol: string;
  amount_usd: number;
  timestamp: number;
}
