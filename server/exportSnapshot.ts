import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { openLeaderboardDb } from './db.js';
import { runIndexerOnce, buildSnapshotPayload } from './indexer.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const memDb = openLeaderboardDb(':memory:');
await runIndexerOnce(memDb);
const snapshot = buildSnapshotPayload(memDb);

const outDir = path.resolve(__dirname, '../public/api');
fs.mkdirSync(outDir, { recursive: true });
const outFile = path.resolve(outDir, 'snapshot.json');
fs.writeFileSync(outFile, JSON.stringify(snapshot, null, 2));
console.log(`[snapshot] Wrote ${snapshot.leaderboard.length} ranked wallets to ${outFile}`);
memDb.close();
