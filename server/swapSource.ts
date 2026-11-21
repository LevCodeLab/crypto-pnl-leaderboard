/**
 * Rate-limited EVM DEX Swap Feed Adapter.
 * Queries `EVM_SWAP_API_URL` when configured, or serves deterministic synthetic
 * EVM swap fixtures so local indexing, tests, and static snapshot builds run offline.
 */

class RateLimiter {
  private queue: (() => void)[] = [];
  private processing = false;
  private readonly delayMs = Math.round(1000 / 15);

  async wait(): Promise<void> {
    return new Promise((resolve) => {
      this.queue.push(resolve);
      this.process();
    });
  }

  private process() {
    if (this.processing || this.queue.length === 0) return;
    this.processing = true;
    const next = this.queue.shift();
    if (next) next();
    setTimeout(() => {
      this.processing = false;
      this.process();
    }, this.delayMs);
  }
}

const limiter = new RateLimiter();
const nowSec = Math.floor(Date.now() / 1000);

const SAMPLE_TOKENS = [
  { address: '0x1111111111111111111111111111111111111101', symbol: 'ARB', name: 'Arbitrum' },
  { address: '0x1111111111111111111111111111111111111102', symbol: 'UNI', name: 'Uniswap' },
  { address: '0x1111111111111111111111111111111111111103', symbol: 'AAVE', name: 'Aave Protocol' },
  { address: '0x1111111111111111111111111111111111111104', symbol: 'LINK', name: 'Chainlink' },
];

const SAMPLE_WALLETS: Record<string, { stats: any; activity: any[]; created: any }> = {
  '0x71c0a94f000000000000000000000000000049a2': {
    stats: {
      wallet_address: '0x71c0a94f000000000000000000000000000049a2',
      native_balance: '14.5',
      realized_profit: '48250',
      unrealized_profit: '6400',
      realized_profit_pnl: '0.68',
      buy: 112,
      sell: 98,
      bought_cost: '280000',
      pnl_stat: {
        token_num: 64,
        winrate: 0.74,
        pnl_gt_5x_num: 6,
        pnl_2x_5x_num: 22,
        pnl_0x_2x_num: 24,
        pnl_nd5_0x_num: 10,
        pnl_lt_nd5_num: 2,
        avg_holding_period: 98000,
      },
      common: {
        name: 'steady_accumulator.eth',
        created_at: nowSec - 86400 * 420,
        follow_count: 140,
      },
    },
    activity: [
      {
        event_type: 'buy',
        timestamp: nowSec - 120000,
        cost_usd: 4200,
        price_usd: 0.92,
        token: { address: SAMPLE_TOKENS[0].address, symbol: 'ARB', name: 'Arbitrum', total_supply: 1000000 },
      },
      {
        event_type: 'sell',
        timestamp: nowSec - 1800,
        cost_usd: 7800,
        buy_cost_usd: 4200,
        price_usd: 1.71,
        token: { address: SAMPLE_TOKENS[0].address, symbol: 'ARB', name: 'Arbitrum', total_supply: 1000000 },
      },
      {
        event_type: 'buy',
        timestamp: nowSec - 96000,
        cost_usd: 5100,
        price_usd: 7.1,
        mark_price_usd: 8.9,
        token: { address: SAMPLE_TOKENS[1].address, symbol: 'UNI', name: 'Uniswap', total_supply: 100000 },
      },
    ],
    created: { tokens: [] },
  },
  '0x3f8bc120000000000000000000000000000011e4': {
    stats: {
      wallet_address: '0x3f8bc120000000000000000000000000000011e4',
      native_balance: '8.2',
      realized_profit: '29400',
      unrealized_profit: '1920',
      realized_profit_pnl: '0.49',
      buy: 84,
      sell: 145,
      bought_cost: '520000',
      pnl_stat: {
        token_num: 48,
        winrate: 0.66,
        pnl_gt_5x_num: 3,
        pnl_2x_5x_num: 15,
        pnl_0x_2x_num: 18,
        pnl_nd5_0x_num: 9,
        pnl_lt_nd5_num: 3,
        avg_holding_period: 18400,
      },
      common: {
        name: 'ladder_desk.eth',
        created_at: nowSec - 86400 * 210,
        follow_count: 62,
      },
    },
    activity: [
      {
        event_type: 'buy',
        timestamp: nowSec - 28000,
        cost_usd: 6400,
        price_usd: 142.0,
        token: { address: SAMPLE_TOKENS[2].address, symbol: 'AAVE', name: 'Aave Protocol', total_supply: 50000 },
      },
      {
        event_type: 'sell',
        timestamp: nowSec - 9200,
        cost_usd: 4800,
        buy_cost_usd: 3200,
        price_usd: 213.0,
        token: { address: SAMPLE_TOKENS[2].address, symbol: 'AAVE', name: 'Aave Protocol', total_supply: 50000 },
      },
      {
        event_type: 'sell',
        timestamp: nowSec - 1200,
        cost_usd: 5100,
        buy_cost_usd: 3200,
        price_usd: 226.0,
        token: { address: SAMPLE_TOKENS[2].address, symbol: 'AAVE', name: 'Aave Protocol', total_supply: 50000 },
      },
    ],
    created: { tokens: [] },
  },
  '0x94d2e551000000000000000000000000000088c0': {
    stats: {
      wallet_address: '0x94d2e551000000000000000000000000000088c0',
      native_balance: '2.1',
      realized_profit: '19800',
      unrealized_profit: '0',
      realized_profit_pnl: '0.41',
      buy: 18,
      sell: 46,
      bought_cost: '40000',
      pnl_stat: {
        token_num: 24,
        winrate: 0.58,
        pnl_gt_5x_num: 4,
        pnl_2x_5x_num: 6,
        pnl_0x_2x_num: 4,
        pnl_nd5_0x_num: 6,
        pnl_lt_nd5_num: 4,
        avg_holding_period: 900,
      },
      common: {
        name: '',
        created_at: nowSec - 86400 * 4,
        follow_count: 90,
      },
    },
    activity: [
      {
        event_type: 'sell',
        timestamp: nowSec - 600,
        cost_usd: 9200,
        buy_cost_usd: 0,
        price_usd: 14.5,
        token: { address: SAMPLE_TOKENS[3].address, symbol: 'LINK', name: 'Chainlink', total_supply: 80000 },
      },
      {
        event_type: 'buy',
        timestamp: nowSec - 3600,
        cost_usd: 1500,
        price_usd: 0.95,
        token: { address: SAMPLE_TOKENS[0].address, symbol: 'ARB', name: 'Arbitrum', total_supply: 1000000 },
      },
      {
        event_type: 'sell',
        timestamp: nowSec - 3490,
        cost_usd: 2100,
        buy_cost_usd: 1500,
        price_usd: 1.33,
        token: { address: SAMPLE_TOKENS[0].address, symbol: 'ARB', name: 'Arbitrum', total_supply: 1000000 },
      },
    ],
    created: { tokens: [] },
  },
};

async function fetchJson(endpoint: string): Promise<any> {
  const baseUrl = process.env.EVM_SWAP_API_URL;
  if (!baseUrl) return null;
  await limiter.wait();
  const res = await fetch(`${baseUrl.replace(/\/$/, '')}${endpoint}`);
  if (!res.ok) return null;
  return res.json();
}

export async function getActivePools(bucket: 'trending' | 'graduated' | 'new_pairs', limit = 10) {
  const remote = await fetchJson(`/pools?bucket=${bucket}&limit=${limit}`);
  if (remote) return remote;
  return { [bucket]: SAMPLE_TOKENS.slice(0, limit) };
}

export async function getTopTraders(tokenAddress: string, limit = 20) {
  const remote = await fetchJson(`/tokens/${tokenAddress}/traders?limit=${limit}`);
  if (remote?.list) return remote.list;
  return Object.keys(SAMPLE_WALLETS)
    .slice(0, limit)
    .map((address) => ({ address, addr_type: 0 }));
}

export async function getPortfolioStats(walletAddress: string) {
  const remote = await fetchJson(`/wallets/${walletAddress}/stats`);
  if (remote) return remote;
  return SAMPLE_WALLETS[walletAddress.toLowerCase()]?.stats || null;
}

export async function getPortfolioActivity(walletAddress: string, limit = 100) {
  const remote = await fetchJson(`/wallets/${walletAddress}/activity?limit=${limit}`);
  if (remote?.activities) return remote.activities;
  return (SAMPLE_WALLETS[walletAddress.toLowerCase()]?.activity || []).slice(0, limit);
}

export async function getCreatedTokens(walletAddress: string) {
  const remote = await fetchJson(`/wallets/${walletAddress}/created`);
  if (remote) return remote;
  return SAMPLE_WALLETS[walletAddress.toLowerCase()]?.created || { tokens: [] };
}
