let snapshot = null;
let currentView = 'leaderboard';
let currentSort = 'track_score';

document.addEventListener('DOMContentLoaded', () => {
  fetchSnapshot();
  setInterval(fetchSnapshot, 10000);
});

async function fetchSnapshot() {
  try {
    let res = await fetch('/api/snapshot');
    if (!res.ok) {
      res = await fetch('./api/snapshot.json');
    }
    if (!res.ok) return;
    snapshot = await res.json();
    renderAll();
  } catch {}
}

function fAddr(addr) {
  if (!addr) return '0x0000...0000';
  return addr.slice(0, 6) + '...' + addr.slice(-4);
}

function fUSD(val) {
  const n = parseFloat(val) || 0;
  const sign = n < 0 ? '-' : '+';
  const abs = Math.abs(n);
  if (abs >= 1e6) return sign + '$' + (abs / 1e6).toFixed(2) + 'M';
  if (abs >= 1e3) return sign + '$' + (abs / 1e3).toFixed(1) + 'K';
  return sign + '$' + abs.toFixed(0);
}

function fPct(val) {
  return Math.round((parseFloat(val) || 0) * 100) + '%';
}

function formatHold(seconds) {
  const s = parseFloat(seconds) || 0;
  if (s < 60) return Math.round(s) + 's';
  if (s < 3600) return Math.round(s / 60) + 'm';
  if (s < 86400) return (s / 3600).toFixed(1) + 'h';
  return (s / 86400).toFixed(1) + 'd';
}

function renderAll() {
  if (!snapshot) return;
  const statEl = document.getElementById('stat-wallets');
  if (statEl) statEl.textContent = snapshot.stats?.wallets ?? 0;

  renderTopRail(snapshot.topWallets || []);
  if (currentView === 'leaderboard') renderLeaderboard(snapshot.leaderboard || []);
  else if (currentView === 'feed') renderFeed(snapshot.feed || []);
  else renderInsiders(snapshot.leaderboard || []);
}

function renderTopRail(wallets) {
  const rail = document.getElementById('top-wallets-rail');
  if (!rail) return;
  rail.innerHTML = wallets
    .map((w) => {
      const winPct = Math.round((w.win_rate || 0) * 100);
      const tags = (w.tags || []).slice(0, 2);
      return `
        <div class="trader-card" onclick="openProfile('${w.address}')">
          <div class="trader-header">
            <div>
              <div class="trader-profit">${fUSD(w.realized_profit)}</div>
              <div class="trader-wallet">${w.name || fAddr(w.address)}</div>
            </div>
            <span class="mono-pill">CPY ${w.copy_score}</span>
          </div>
          <div>
            <div style="display:flex;justify-content:space-between;font-size:11.5px;color:#a1a1aa;margin-bottom:6px;">
              <span>Win Rate ${winPct}%</span>
              <span>TRK ${w.track_score}</span>
            </div>
            <div class="bar-track">
              <div class="bar-fill" style="width:${winPct}%"></div>
            </div>
          </div>
          <div style="display:flex;gap:6px;flex-wrap:wrap;">
            ${tags.map((t) => `<span class="mono-pill">${t.name}</span>`).join('')}
          </div>
        </div>
      `;
    })
    .join('');
}

function renderLeaderboard(wallets) {
  const el = document.getElementById('content-inner');
  const sorted = [...wallets].sort((a, b) => {
    if (currentSort === 'profit') return (b.realized_profit || 0) - (a.realized_profit || 0);
    if (currentSort === 'winrate') return (b.win_rate || 0) - (a.win_rate || 0);
    if (currentSort === 'copy_score') return (b.copy_score || 0) - (a.copy_score || 0);
    return (b.track_score || 0) - (a.track_score || 0);
  });

  el.innerHTML = `
    <div class="sort-tabs">
      <button class="btn ${currentSort === 'track_score' ? 'active' : ''}" onclick="setSort('track_score')">Track Score</button>
      <button class="btn ${currentSort === 'copy_score' ? 'active' : ''}" onclick="setSort('copy_score')">Copy Score</button>
      <button class="btn ${currentSort === 'profit' ? 'active' : ''}" onclick="setSort('profit')">Realized PnL</button>
      <button class="btn ${currentSort === 'winrate' ? 'active' : ''}" onclick="setSort('winrate')">Win Rate</button>
    </div>
    <div class="lb-table">
      <div class="lb-header">
        <span>#</span>
        <span>Wallet</span>
        <span>Realized PnL</span>
        <span>Unrealized</span>
        <span>TRK</span>
        <span>CPY</span>
      </div>
      ${sorted
        .map(
          (w, idx) => `
        <div class="lb-row" onclick="openProfile('${w.address}')">
          <span style="color:#71717a;font-family:monospace;">${idx + 1}</span>
          <div>
            <div style="font-weight:600;font-size:13px;">${w.name || fAddr(w.address)}</div>
            <div style="font-size:11px;color:#71717a;font-family:monospace;">${fAddr(w.address)} · Win ${fPct(w.win_rate)}</div>
          </div>
          <span class="stat-val">${fUSD(w.realized_profit)}</span>
          <span class="stat-val" style="color:#a1a1aa;">${fUSD(w.unrealized_profit || 0)}</span>
          <span class="mono-pill">${w.track_score}</span>
          <span class="mono-pill">${w.copy_score}</span>
        </div>
      `
        )
        .join('')}
    </div>
  `;
}

function renderFeed(feed) {
  const el = document.getElementById('content-inner');
  if (!feed.length) {
    el.innerHTML = `<div class="mono-pill">No swap events indexed yet.</div>`;
    return;
  }

  el.innerHTML = feed
    .map(
      (item) => `
      <div class="feed-card" onclick="openProfile('${item.wallet_address}')">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;">
          <div>
            <strong>${item.wallet_name || fAddr(item.wallet_address)}</strong>
            <span class="mono-pill" style="margin-left:8px;">${String(item.action).toUpperCase()} $${item.token_symbol}</span>
          </div>
          <span style="font-size:12px;color:#a1a1aa;font-family:monospace;">$${Math.round(item.amount_usd || 0).toLocaleString()}</span>
        </div>
        <div class="feed-stats-grid">
          <div><div class="stat-label">Avg Hold</div><div class="stat-val">${formatHold(item.avg_real_hold_s)}</div></div>
          <div><div class="stat-label">Win Rate</div><div class="stat-val">${fPct(item.win_rate)}</div></div>
          <div><div class="stat-label">Track</div><div class="stat-val">${item.track_score}</div></div>
          <div><div class="stat-label">Copy</div><div class="stat-val">${item.copy_score}</div></div>
        </div>
      </div>
    `
    )
    .join('');
}

function renderInsiders(wallets) {
  const flagged = wallets.filter((w) =>
    (w.tags || []).some((t) =>
      ['Hidden Insider', 'Stealth Dumper', 'Copy Trap', 'Pump & Dump'].includes(t.name)
    )
  );
  renderLeaderboard(flagged);
}

async function openProfile(addr) {
  const modal = document.getElementById('profile-modal');
  const content = document.getElementById('profile-content');
  const wallet = (snapshot?.leaderboard || []).find((w) => w.address === addr);
  if (!wallet) return;

  content.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;">
      <div>
        <div style="font-size:16px;font-weight:600;">${wallet.name || fAddr(wallet.address)}</div>
        <div style="font-size:11px;color:#71717a;font-family:monospace;">${wallet.address}</div>
      </div>
      <button class="btn" onclick="closeProfile()">Close</button>
    </div>
    <div class="feed-stats-grid">
      <div><div class="stat-label">Realized</div><div class="stat-val">${fUSD(wallet.realized_profit)}</div></div>
      <div><div class="stat-label">Unrealized</div><div class="stat-val">${fUSD(wallet.unrealized_profit || 0)}</div></div>
      <div><div class="stat-label">Track</div><div class="stat-val">${wallet.track_score}</div></div>
      <div><div class="stat-label">Copy</div><div class="stat-val">${wallet.copy_score}</div></div>
    </div>
    <div style="display:flex;gap:6px;flex-wrap:wrap;">
      ${(wallet.tags || []).map((t) => `<span class="mono-pill">${t.name}</span>`).join('')}
    </div>
  `;
  modal.classList.add('visible');
}

function closeProfile() {
  document.getElementById('profile-modal')?.classList.remove('visible');
}

function switchView(view, btn) {
  currentView = view;
  document.querySelectorAll('#view-tabs .btn').forEach((b) => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  renderAll();
}

function setSort(sort) {
  currentSort = sort;
  renderAll();
}

function openGuideModal() {
  document.getElementById('guide-modal')?.classList.add('visible');
}

function closeGuideModal() {
  document.getElementById('guide-modal')?.classList.remove('visible');
}

function onGuideOverlayClick(e) {
  if (e.target.id === 'guide-modal') closeGuideModal();
}
