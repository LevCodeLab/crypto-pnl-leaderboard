export function normalizeStats(rawStats: any) {
  const pnl = rawStats?.pnl_stat || {};
  const common = rawStats?.common || {};

  const f = (val: any) => parseFloat(val) || 0;

  const buy = Math.floor(f(rawStats?.buy));
  const sell = Math.floor(f(rawStats?.sell));
  const tn = Math.floor(f(pnl?.token_num));

  const dist = {
    gt_5: Math.floor(f(pnl?.pnl_gt_5x_num)),
    x2_5: Math.floor(f(pnl?.pnl_2x_5x_num)),
    x0_2: Math.floor(f(pnl?.pnl_0x_2x_num)),
    n50_0: Math.floor(f(pnl?.pnl_nd5_0x_num)),
    lt_n50: Math.floor(f(pnl?.pnl_lt_nd5_num)),
  };

  const realized = f(rawStats?.realized_profit);
  const unrealized = f(rawStats?.unrealized_profit);

  return {
    address: rawStats?.wallet_address || '',
    native_balance: f(rawStats?.native_balance),
    realized_profit: realized,
    unrealized_profit: unrealized,
    roi: f(rawStats?.realized_profit_pnl),
    buy,
    sell,
    trades: buy + sell,
    avg_buy_usd: buy ? f(rawStats?.bought_cost) / buy : 0,
    avg_trade_usd: sell ? realized / sell : 0,
    token_num: tn,
    winrate: f(pnl?.winrate),
    dist,
    avg_hold_s: f(pnl?.avg_holding_period),
    name: common?.name || common?.ens || '',
    tags: common?.tags || [],
    created_token_count: Math.floor(f(common?.created_token_count)),
    wallet_age_days: common?.created_at ? Math.max(0, (Date.now() / 1000 - f(common.created_at)) / 86400) : -1,
    follower_count: Math.floor(f(common?.follow_count)),
    buy_sell_ratio: sell > 0 ? buy / sell : 1,
  };
}

export function summarizeActivity(activities: any[]) {
  const f = (val: any) => parseFloat(val) || 0;
  const byTok: Record<string, any[]> = {};

  for (const a of activities) {
    const tokAddr = a.token?.address || 'unknown';
    if (!byTok[tokAddr]) byTok[tokAddr] = [];
    byTok[tokAddr].push(a);
  }

  let totalRoundtrips = 0;
  let uncopyableSells = 0;
  let fastDumpSells = 0;
  let totalHoldS = 0;
  let volumeHoldProduct = 0;
  let totalSellVolume = 0;
  let totalPerTradePnl = 0;
  let unrealizedPnl = 0;
  let priceImpactSum = 0;
  let sellTxCount = 0;
  let ghostSells = 0;
  let ghostProfit = 0;
  let totalSlippage = 0;
  const entryMcaps: number[] = [];

  const customDist = { loss: 0, x1_15: 0, x15_2: 0, x2_3: 0, x3_plus: 0 };

  for (const evs of Object.values(byTok)) {
    evs.sort((a, b) => f(a.timestamp) - f(b.timestamp));
    const buys = evs.filter((e) => e.event_type === 'buy');
    const sells = evs.filter((e) => e.event_type === 'sell');

    if (sells.length > 0 && buys.length === 0) {
      ghostSells++;
      const sellUsd = sells.reduce((acc, s) => acc + f(s.cost_usd), 0);
      const basisUsd = sells.reduce((acc, s) => acc + f(s.buy_cost_usd), 0);
      ghostProfit += sellUsd - basisUsd;
    } else if (buys.length > 0 && sells.length === 0) {
      // Open position -> estimate unrealized PnL from latest mark_price_usd if present
      const costBasis = buys.reduce((acc, b) => acc + f(b.cost_usd), 0);
      const entryPrice = f(buys[0].price_usd);
      const markPrice = f(buys[buys.length - 1].mark_price_usd || buys[buys.length - 1].price_usd);
      if (entryPrice > 0 && markPrice > 0) {
        unrealizedPnl += costBasis * (markPrice / entryPrice - 1);
      }
    } else if (buys.length > 0 && sells.length > 0) {
      totalRoundtrips++;
      const firstBuyTs = f(buys[0].timestamp);
      const firstSellTs = f(sells[0].timestamp);
      const hold = firstSellTs - firstBuyTs;

      const sellUsd = sells.reduce((acc, s) => acc + f(s.cost_usd), 0);
      sellTxCount += sells.length;

      if (hold >= 0) {
        totalHoldS += hold;
        volumeHoldProduct += hold * sellUsd;
        totalSellVolume += sellUsd;
        if (hold <= 30) uncopyableSells++;
        if (hold <= 120) fastDumpSells++;
      }

      const buyP = f(buys[0].price_usd);
      const sellP = f(sells[0].price_usd);
      if (buyP > 0 && sellP > 0) {
        priceImpactSum += sellP / buyP;
      }

      const mcap = buyP * (f(buys[0].token?.total_supply) || 1e9);
      if (mcap > 0 && mcap < 100_000_000) entryMcaps.push(mcap);

      const basisUsd = sells.reduce((acc, s) => acc + f(s.buy_cost_usd), 0);
      if (basisUsd > 0) {
        totalPerTradePnl += sellUsd - basisUsd;
        const multiplier = sellUsd / basisUsd;
        if (multiplier < 1) customDist.loss++;
        else if (multiplier < 1.5) customDist.x1_15++;
        else if (multiplier < 2) customDist.x15_2++;
        else if (multiplier < 3) customDist.x2_3++;
        else customDist.x3_plus++;
      }

      for (const t of evs) {
        const cost = f(t.cost_usd);
        const quote = f(t.quote_amount);
        if (quote > 0 && quote > cost) {
          totalSlippage += 1 - cost / quote;
        }
      }
    }
  }

  const tokCount = Object.keys(byTok).length;
  entryMcaps.sort((a, b) => a - b);
  const medianEntryMcap = entryMcaps.length > 0 ? entryMcaps[Math.floor(entryMcaps.length / 2)] : 0;

  return {
    sampled: activities.length,
    ghost_sell_ratio: tokCount ? ghostSells / tokCount : 0,
    ghost_sell_profit: ghostProfit,
    unrealized_pnl: unrealizedPnl,
    uncopyable_rate: totalRoundtrips ? uncopyableSells / totalRoundtrips : 0,
    fast_dump_rate: totalRoundtrips ? fastDumpSells / totalRoundtrips : 0,
    avg_price_impact: totalRoundtrips ? priceImpactSum / totalRoundtrips : -1,
    avg_real_hold_s: totalRoundtrips ? totalHoldS / totalRoundtrips : 0,
    per_trade_pnl: totalRoundtrips ? totalPerTradePnl / totalRoundtrips : 0,
    slippage_rate: activities.length ? totalSlippage / activities.length : 0,
    volume_weighted_hold_s: totalSellVolume > 0
      ? volumeHoldProduct / totalSellVolume
      : totalRoundtrips ? totalHoldS / totalRoundtrips : 0,
    sell_tx_per_token: totalRoundtrips ? sellTxCount / totalRoundtrips : 0,
    median_entry_mcap: medianEntryMcap,
    custom_dist: customDist,
  };
}

const clamp = (v: number) => Math.max(0, Math.min(1, v));

export function computeScores(
  w: ReturnType<typeof normalizeStats>,
  summ: ReturnType<typeof summarizeActivity>
) {
  const tn = Math.max(1, w.token_num);
  const d = w.dist;

  const tail = 1 - d.lt_n50 / tn;
  const upside = (d.gt_5 + d.x2_5 + d.x0_2) / tn;
  const roi = clamp((w.roi + 0.05) / 0.35);
  const win = clamp(w.winrate / 0.5);
  const size = clamp((tn - 20) / 300);
  const holdQuality = clamp(summ.avg_real_hold_s / 300);

  const trackWt = { tail: 0.28, upside: 0.24, roi: 0.16, win: 0.1, size: 0.1, holdQuality: 0.12 };
  let trackScore = Math.round(
    100 *
      (trackWt.tail * clamp(tail) +
        trackWt.upside * clamp(upside) +
        trackWt.roi * roi +
        trackWt.win * win +
        trackWt.size * size +
        trackWt.holdQuality * holdQuality)
  );

  if (summ.ghost_sell_ratio >= 0.3 && w.wallet_age_days >= 0 && w.wallet_age_days < 7) {
    trackScore = Math.min(trackScore, 30);
  } else if (w.wallet_age_days >= 0 && w.wallet_age_days < 3 && w.realized_profit > 10000) {
    trackScore = Math.round(trackScore * 0.4);
  } else if (w.trades >= 1000 && summ.avg_real_hold_s < 60) {
    trackScore = Math.min(trackScore, 50);
  }

  if (summ.fast_dump_rate >= 0.7) {
    trackScore = Math.round(trackScore * 0.5);
  }

  const entryGap = summ.avg_price_impact === -1 ? 0.3 : clamp(1 - (summ.avg_price_impact - 1) / 10);
  const dumpSafety = clamp(1 - summ.fast_dump_rate);
  const copyable = clamp(1 - summ.uncopyable_rate);
  const profitPerTrade = clamp(summ.per_trade_pnl / 200);
  const hold = clamp(summ.avg_real_hold_s / 172800);
  const insiderSafety = clamp(1 - summ.ghost_sell_ratio);
  const slippageSafety = clamp(1 - summ.slippage_rate * 5);
  const volumeHold = clamp(summ.volume_weighted_hold_s / 172800);

  const copyWt = {
    entry: 0.18,
    dump: 0.2,
    copyable: 0.16,
    profit: 0.15,
    hold: 0.1,
    insider: 0.1,
    slippage: 0.05,
    volumeHold: 0.06,
  };
  let copyScore = Math.round(
    100 *
      (copyWt.entry * entryGap +
        copyWt.dump * dumpSafety +
        copyWt.copyable * copyable +
        copyWt.profit * profitPerTrade +
        copyWt.hold * hold +
        copyWt.insider * insiderSafety +
        copyWt.slippage * slippageSafety +
        copyWt.volumeHold * volumeHold)
  );

  const isDev = w.created_token_count > tn / 2;
  if (isDev) {
    trackScore = Math.round(trackScore * 0.45);
    copyScore = Math.round(copyScore * 0.45);
  }

  if (summ.fast_dump_rate >= 0.5) {
    copyScore = Math.round(copyScore * 0.6);
  }

  const details = {
    track: { tail, upside, roi, win, size, holdQuality },
    copy: { entryGap, dumpSafety, copyable, profitPerTrade, hold, insiderSafety, volumeHold },
    smart: {
      ghost_sell_ratio: summ.ghost_sell_ratio,
      uncopyable_rate: summ.uncopyable_rate,
      avg_price_impact: summ.avg_price_impact,
    },
    isDev,
  };

  return { trackScore, copyScore, details };
}

export function getWalletTags(
  w: ReturnType<typeof normalizeStats>,
  summ: ReturnType<typeof summarizeActivity>,
  isDev: boolean
) {
  const tags: { emoji: string; name: string }[] = [];
  const add = (emoji: string, name: string) => tags.push({ emoji, name });

  if (isDev) add('🏭', 'Token Creator');
  if (summ.ghost_sell_ratio >= 0.5 && w.realized_profit > 1000) add('🕵️', 'Hidden Insider');
  if (summ.fast_dump_rate >= 0.5 && summ.avg_real_hold_s < 120) add('💀', 'Pump & Dump');
  if (summ.avg_price_impact >= 5 && w.follower_count >= 50) add('🪤', 'Copy Trap');
  if (summ.uncopyable_rate >= 0.3) add('🚫', 'Uncopyable');
  if (summ.ghost_sell_ratio >= 0.3 && summ.ghost_sell_profit > 5000) add('🐍', 'Stealth Dumper');
  if (summ.avg_real_hold_s < 30 && w.winrate > 0.8 && w.trades > 500) add('🎯', 'Sniper');
  if (summ.sell_tx_per_token > 1.5 && summ.fast_dump_rate < 0.2) add('📊', 'Ladder Seller');

  if (summ.avg_real_hold_s >= 86400 && summ.fast_dump_rate < 0.1 && w.realized_profit > 0) {
    add('💪', 'Conviction Holder');
  }
  if (w.trades >= 2000) add('🤖', 'Bot / Quant');
  if (w.avg_buy_usd >= 5000) add('🐋', 'Whale');

  if (
    w.realized_profit > 20000 &&
    summ.ghost_sell_ratio < 0.1 &&
    summ.avg_price_impact > 0 &&
    summ.avg_price_impact < 2.5 &&
    summ.fast_dump_rate < 0.3 &&
    summ.uncopyable_rate < 0.2
  ) {
    add('⭐', 'True Alpha');
  } else if (w.dist.lt_n50 / Math.max(1, w.token_num) >= 0.3 && w.realized_profit < 0) {
    add('🩸', 'Bag Holder');
  }

  return tags;
}
