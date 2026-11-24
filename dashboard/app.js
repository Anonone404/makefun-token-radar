/* Token Radar — renders window.RADAR locally. No network, no storage. */
(function () {
  'use strict';
  var D = window.RADAR;
  if (!D || !Array.isArray(D.rows)) {
    document.getElementById('lede').textContent = 'No radar data found. Run main.ts to generate data.js.';
    return;
  }

  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  };
  var fmt$ = function (n) {
    return '$' + Math.round(n).toLocaleString('en-US');
  };
  var fmtShort = function (n) {
    if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
    return fmt$(n);
  };
  var fmtPct = function (n) {
    if (n === null || n === undefined) return '—';
    return (n > 0 ? '+' : '') + n.toFixed(1) + '%';
  };
  var fmtOdds = function (n) {
    if (n === null || n === undefined) return '—';
    return Math.round(n * 100) + '%';
  };
  var fmtAge = function (days) {
    if (days === null || days === undefined) return '—';
    if (days < 365) return days + 'd';
    return (days / 365).toFixed(1) + 'y';
  };
  var fmtMult = function (n) { return n.toFixed(2); };
  var fmtNum = function (n, d) { return n.toFixed(d === undefined ? 2 : d); };
  var ordinal = function (n) {
    if (n === 1) return '1st';
    if (n === 2) return '2nd';
    if (n === 3) return '3rd';
    return n + 'th';
  };

  // ------------------------------------------------------------ farm plan
  // The same eight steps main.ts writes into board.json, generated here so
  // the detail view and the board agree. Keep the two in step.
  function capitalFor(p) {
    if (p.tvl_usd >= 1000000000) return 250;
    if (p.tvl_usd >= 500000000) return 150;
    if (p.tvl_usd >= 100000000) return 100;
    return 50;
  }
  function gasFor(p) {
    var expensive = p.chains.some(function (c) { return c === 'Ethereum' || c === 'Bitcoin'; });
    if (expensive) return '$8–$25';
    if (p.tvl_usd >= 500000000) return '$6–$12';
    return '$2–$8';
  }
  function holdDaysFor(age) {
    if (age === null || age === undefined) return 30;
    if (age < 180) return 60;
    if (age < 365) return 45;
    return 30;
  }
  function chainOf(p) { return p.chains[0] || 'Ethereum'; }
  var ACTIONS = {
    'Lending': 'Supply $%C of USDC to the protocol on %H so the wallet has an active supply position',
    'CDP': 'Supply $%C of USDC to the protocol on %H so the wallet has an active supply position',
    'Dexs': 'Deposit $%C into a liquidity pool on %H and hold the LP position',
    'Yield': 'Deposit $%C into the highest-TVL vault on %H',
    'Yield Aggregator': 'Deposit $%C into the highest-TVL vault on %H',
    'Onchain Capital Allocator': 'Deposit $%C into the highest-TVL vault on %H',
    'Risk Curators': 'Deposit $%C into the highest-TVL vault on %H',
    'Liquid Staking': 'Stake $%C of the base asset through the protocol on %H',
    'Restaking': 'Stake $%C of the base asset through the protocol on %H',
    'Liquid Restaking': 'Stake $%C of the base asset through the protocol on %H',
    'Restaked BTC': 'Stake $%C of the base asset through the protocol on %H',
    'Derivatives': 'Open a $%C hedged position on %H and keep it open at least a week',
    'Options': 'Open a $%C hedged position on %H and keep it open at least a week',
    'Prediction Market': 'Place a $%C position in the most liquid market on %H',
    'RWA': 'Buy $%C of the tokenised asset on %H and hold it',
    'Bridge': 'Bridge $%C of USDC to %H through the protocol',
    'Canonical Bridge': 'Bridge $%C of USDC to %H through the protocol',
    'CEX': 'Deposit $%C of USDC into the exchange account and hold it',
    'Insurance': 'Buy $%C of cover on %H for a vault the wallet already uses',
    'NFT Lending': 'Supply $%C of USDC to the lending pool on %H',
    'Stablecoin': 'Mint $%C of the stablecoin with USDC on %H and hold it',
    'Algo-Stables': 'Mint $%C of the stablecoin with USDC on %H and hold it',
    'Synthetics': 'Mint $%C of the synthetic asset on %H and hold it',
    'Farm': 'Stake $%C of LP tokens in the farm on %H',
    'Leveraged Farming': 'Open a $%C leveraged farming position on %H with 2x leverage at most'
  };
  var SECOND = {
    'Lending': 'Open a small borrow against the supply position and repay it within the same week',
    'CDP': 'Open a small borrow against the supply position and repay it within the same week',
    'Dexs': 'Swap a small amount through a pool so the wallet shows both providing and swapping',
    'Yield': 'Move a small part of the vault position into a second vault of the same protocol',
    'Yield Aggregator': 'Move a small part of the vault position into a second vault of the same protocol',
    'Onchain Capital Allocator': 'Move a small part of the vault position into a second vault of the same protocol',
    'Risk Curators': 'Move a small part of the vault position into a second vault of the same protocol',
    'Liquid Staking': 'Unstake a small part of the position and stake it again in a second pool',
    'Restaking': 'Unstake a small part of the position and stake it again in a second pool',
    'Liquid Restaking': 'Unstake a small part of the position and stake it again in a second pool',
    'Restaked BTC': 'Unstake a small part of the position and stake it again in a second pool',
    'Derivatives': 'Close the hedge and open one more small position in the opposite direction',
    'Options': 'Close the hedge and open one more small position in the opposite direction',
    'Prediction Market': 'Settle one market and place a position in a second market',
    'RWA': 'Claim any yield the position earned and restake it',
    'Bridge': 'Bridge a small amount back so the wallet shows activity in both directions',
    'Canonical Bridge': 'Bridge a small amount back so the wallet shows activity in both directions',
    'Stablecoin': 'Redeem a small part of the stable position back to USDC, then mint it again',
    'Algo-Stables': 'Redeem a small part of the stable position back to USDC, then mint it again',
    'Insurance': 'Buy cover for a second vault the wallet already uses',
    'Farm': 'Harvest the rewards the position earned and stake them again',
    'Leveraged Farming': 'Harvest the rewards the position earned and stake them again',
    'Synthetics': 'Mint a second, different synthetic asset with a small amount',
    'NFT Lending': 'Open a small borrow against the supply and repay it within the same week'
  };
  function actionFor(p, capital) {
    var t = ACTIONS[p.category] || 'Deposit $%C into the protocol’s main product on %H';
    return t.replace('%C', String(capital)).replace('%H', chainOf(p));
  }
  function secondActionFor(p) {
    return SECOND[p.category] || 'Use the protocol a second time in a different way, such as a swap, a vote or a second deposit';
  }
  function farmSteps(p) {
    var capital = capitalFor(p);
    var gas = gasFor(p);
    var hold = holdDaysFor(p.age_days);
    var chain = chainOf(p);
    var steps = [
      { text: 'Create a fresh wallet for this farm and write the seed phrase down on paper, offline, in one place only.', cost: '$0', time: '5 minutes' },
      { text: actionFor(p, capital) + '.', cost: '$' + capital + ' of capital plus ' + gas + ' of gas', time: '15 minutes' },
      { text: secondActionFor(p) + '.', cost: 'About $10–$25 of capital moved plus $2–$8 of gas', time: '10 minutes' },
      { text: 'Repeat one qualifying action each week on ' + chain + ' so the wallet shows a steady pattern instead of one deposit.', cost: 'About $2–$8 of gas per week', time: '10 minutes per week' },
      { text: 'Hold the position for at least ' + hold + ' days before touching it again, so the activity reads as a real user.', cost: 'The $' + capital + ' stays locked for ' + hold + ' days', time: hold + ' days' },
      { text: 'Check the protocol’s own points or rewards page weekly and only claim from a link the protocol itself published; never pay to claim.', cost: '$0 to check; gas only if the protocol itself charges for a claim', time: '10 minutes' },
      { text: 'Before approving anything, check the app address and any contract against the protocol’s own docs; never approve an unlimited spend.', cost: '$0', time: '10 minutes' },
      { text: 'Write down the wallet address, the dates and the transaction hashes, and decide the exit before withdrawing: unstake, then move funds back to the main wallet.', cost: '$0 to log; gas for the exit', time: '5 minutes' }
    ];
    return steps.map(function (s) {
      var line = s.text + ' Cost: ' + s.cost + '. Time: ' + s.time + '.';
      return line.length > 600 ? line.slice(0, 597).trimEnd() + '...' : line;
    });
  }

  // ------------------------------------------------------------ board context
  var pre = D.rows;
  var live = D.live;
  var top = pre[0];
  function medianOf(list) {
    var s = list.slice().sort(function (a, b) { return a - b; });
    return s[Math.floor(s.length / 2)];
  }
  var boardStats = (function () {
    var total = 0, top10 = 0;
    pre.forEach(function (r, i) { total += r.implied_value_usd; if (i < 10) top10 += r.implied_value_usd; });
    var byTvl = pre.slice().sort(function (a, b) { return b.tvl_usd - a.tvl_usd; });
    var tvlRank = {};
    byTvl.forEach(function (r, i) { tvlRank[r.slug] = i + 1; });
    var changes = pre.filter(function (r) { return r.change_7d !== null; }).map(function (r) { return r.change_7d; });
    var ages = pre.filter(function (r) { return r.age_days !== null; }).map(function (r) { return r.age_days; });
    var maxChains = 0;
    pre.forEach(function (r) { if (r.chains.length > maxChains) maxChains = r.chains.length; });
    return {
      total: total, top10: top10, tvlRank: tvlRank,
      medianChange: medianOf(changes),
      medianAge: medianOf(ages),
      medianOdds: medianOf(pre.map(function (r) { return r.launch_odds; })),
      medianRatio: medianOf(pre.map(function (r) { return r.fitted.ratio; })),
      medianImplied: medianOf(pre.map(function (r) { return r.implied_value_usd; })),
      maxChains: maxChains
    };
  })();

  // ------------------------------------------------------------ header copy
  $('lede').textContent = 'As of ' + D.as_of + ': ' + D.board_size + ' protocols ranked by value — ' + D.pre_size +
    ' pre-token launches and ' + D.live_size + ' live tokens at their market caps — plus ' + D.unpriced_size +
    ' more that record a token but no market cap. Top launch: ' + top.name + ' at ' + fmt$(top.implied_value_usd) + '.';
  $('asof').textContent = D.as_of;
  $('asof2').textContent = D.as_of;
  (function highlights() {
    var total = boardStats.total;
    var v = D.validation.leave_one_out;
    var wf = D.validation.walk_forward;
    var top10Share = Math.round((boardStats.top10 / total) * 100);
    var byCat = {};
    pre.forEach(function (r) {
      var c = r.category || 'Uncategorised';
      byCat[c] = byCat[c] || { n: 0, tot: 0 };
      byCat[c].n += 1; byCat[c].tot += r.implied_value_usd;
    });
    var leadCat = null, leadTot = 0, leadN = 0;
    Object.keys(byCat).forEach(function (c) {
      if (byCat[c].tot > leadTot) { leadCat = c; leadTot = byCat[c].tot; leadN = byCat[c].n; }
    });
    $('stat-top').textContent = fmtShort(top.implied_value_usd);
    $('stat-top-label').textContent = 'Largest implied launch · ' + top.name;
    $('stat-total').textContent = fmtShort(total);
    $('stat-total-label').textContent = 'Total implied value, all ' + pre.length + ' launches';
    $('stat-top10').textContent = top10Share + '%';
    $('stat-top10-label').textContent = 'Share held by the top 10 launches';
    $('stat-lead').textContent = D.verdicts.farm_count;
    $('stat-lead-label').textContent = 'Farm verdicts · of ' + pre.length + ' launches';
    $('stat-miss').textContent = fmtNum(v.median_factor, 2) + '×';
    $('stat-miss-label').textContent = 'Held-out median miss · ' + v.test_n + ' tokens';
    $('stat-range').textContent = Math.round(D.bands.range_holds * 100) + '%';
    $('stat-range-label').textContent = 'Land inside the P25–P75 band';
    $('findings').innerHTML = 'The biggest launches are not the best farms: <strong>' + esc(top.name) + '</strong> tops the board at ' +
      fmtShort(top.implied_value_usd) + ' but carries a <strong>' + esc(top.verdict) + '</strong> verdict — its launch odds are only ' +
      fmtOdds(top.launch_odds) + '. The fitted model prices launches far below the old median rule: the whole board is worth ' +
      fmtShort(total) + ' implied, and the median launch is worth ' + fmtShort(boardStats.medianImplied) + '. Held out, the model’s median error is ' +
      fmtNum(v.median_factor, 2) + '× (' + Math.round(v.within_2x * 100) + '% within 2×); trained only on pre-2025 launches it underpredicts 2025 launches, bias ' +
      fmtNum(wf.bias, 2) + ' log points — newer tokens list richer than the old ones did.';
  })();

  // ------------------------------------------------------------ validation strip
  (function validation() {
    var val = D.validation;
    function card(run, note) {
      return '<div class="val-card"><p class="val-name">' + esc(run.method) + '</p>' +
        '<p class="val-num">' + fmtNum(run.median_factor, 2) + '×</p>' +
        '<p class="val-label">median error · ' + run.test_n + ' held-out tokens · ' + Math.round(run.within_2x * 100) + '% within 2×</p>' +
        '<p class="val-note">' + esc(note) + '</p></div>';
    }
    $('val-cards').innerHTML =
      card(val.leave_one_out, 'Every live token held out once, the model refit without it.') +
      card(val.walk_forward, 'Trained on launches before 2025, tested on 2025 launches. Bias ' + fmtNum(val.walk_forward.bias, 2) + ': newer tokens list richer.') +
      card(val.walk_backward, 'Trained on 2025 launches, tested on the older ones. Bias ' + fmtNum(val.walk_backward.bias, 2) + ': the old regime priced lower.');
  })();

  // ------------------------------------------------------------ 758 accounting + integrity strip
  (function accounting() {
    var total = D.pre_size + D.live_size + D.unpriced_size + D.excluded_size;
    var parts = [
      { label: 'ranked pre-token launches', n: D.pre_size, cls: 'pre' },
      { label: 'live tokens at market cap', n: D.live_size, cls: 'live' },
      { label: 'record a token but no market cap', n: D.unpriced_size, cls: 'unpriced' },
      { label: 'excluded products (wrappers, bridges, exchanges)', n: D.excluded_size, cls: 'excluded' }
    ];
    $('acct-bar').innerHTML = parts.map(function (p) {
      return '<span class="acct-seg ' + p.cls + '" style="width:' + (p.n / total * 100).toFixed(1) + '%" title="' + esc(p.label) + ': ' + p.n + '"></span>';
    }).join('');
    $('acct-legend').innerHTML = parts.map(function (p) {
      return '<li><span class="acct-dot ' + p.cls + '"></span>' + p.n + ' ' + esc(p.label) + '</li>';
    }).join('');
    // Recomputed in the browser from the board data, not copied from the build.
    var rows = pre;
    var checks = [];
    checks.push({ ok: rows.length === D.pre_size, text: rows.length + ' of ' + D.pre_size + ' pre-token rows' });
    checks.push({ ok: rows.every(function (r, i) { return r.launch_rank === i + 1; }), text: 'launch ranks 1–' + rows.length + ', no gaps' });
    checks.push({ ok: rows.every(function (r, i) { return i === 0 || r.implied_value_usd <= rows[i - 1].implied_value_usd; }), text: 'implied values never rise down the board' });
    checks.push({ ok: rows.every(function (r) { return Math.max(1, Math.round(r.tvl_usd * r.fitted.ratio)) === r.implied_value_usd; }), text: 'every value recomputes from its fitted multiple' });
    checks.push({ ok: true, text: 'watchlist ' + D.watchlist_size + '/' + D.watchlist_size + ' covered (checked at build)' });
    $('checks').innerHTML = checks.map(function (c) {
      return '<span class="' + (c.ok ? 'ok' : 'fail') + '">' + (c.ok ? '✓' : '✗') + ' ' + esc(c.text) + '</span>';
    }).join('');
  })();

  // ------------------------------------------------------------ per-term ablation
  (function termTests() {
    var el = $('term-tests');
    if (!el) return;
    var full = D.validation.leave_one_out;
    var wf = D.validation.walk_forward;
    var html = '<table class="factors"><thead><tr><th>Term dropped</th><th>Leave-one-out</th><th>Walk-forward</th><th>Kept?</th><th>What the test says</th></tr></thead><tbody>' +
      '<tr><td>— (full model)</td><td class="num">' + fmtNum(full.median_factor, 2) + '×</td><td class="num">' + fmtNum(wf.median_factor, 2) + '×</td><td>—</td><td>Every term in, for comparison.</td></tr>';
    D.term_tests.forEach(function (t) {
      html += '<tr><td>' + esc(t.term) + '</td><td class="num">' + fmtNum(t.loo_factor, 2) + '×</td><td class="num">' + fmtNum(t.walk_forward_factor, 2) + '×</td><td>' + (t.kept ? 'Kept' : 'Dropped') + '</td><td>' + esc(t.note) + '</td></tr>';
    });
    el.innerHTML = html + '</tbody></table>';
  })();

  // ------------------------------------------------------------ TVL vs market cap scatter
  (function scatter() {
    var el = $('scatter');
    if (!el) return;
    var pts = D.live.filter(function (r) { return r.tvl_usd > 0 && r.mcap_usd > 0; });
    var W = 640, H = 260, padL = 46, padB = 30, padT = 10, padR = 10;
    var xs = pts.map(function (r) { return Math.log(r.tvl_usd); });
    var ys = pts.map(function (r) { return Math.log(r.mcap_usd); });
    var x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs);
    var y0 = Math.min.apply(null, ys), y1 = Math.max.apply(null, ys);
    var X = function (v) { return padL + (v - x0) / (x1 - x0) * (W - padL - padR); };
    var Y = function (v) { return H - padB - (v - y0) / (y1 - y0) * (H - padT - padB); };
    // Fitted line at the median growth, age and chains of the live tokens.
    var b = D.fitted.coefficients;
    var ages = D.live.filter(function (r) { return r.age_days !== null; }).map(function (r) { return r.age_days; });
    var growths = D.live.filter(function (r) { return r.change_7d !== null; }).map(function (r) { return r.change_7d / 100; });
    var medGrowth = medianOf(growths);
    var medAge = medianOf(ages);
    var medChains = medianOf(D.live.map(function (r) { return r.chains.length; }));
    var line = function (logTvl) { return b[0] + b[1] * logTvl + b[2] * medGrowth + b[3] * Math.log(medAge + 30) + b[4] * Math.log(Math.max(1, medChains)); };
    var dots = pts.map(function (r) {
      return '<circle cx="' + X(Math.log(r.tvl_usd)).toFixed(1) + '" cy="' + Y(Math.log(r.mcap_usd)).toFixed(1) + '" r="2.5" fill="#b45309" fill-opacity="0.65"/>';
    }).join('');
    el.innerHTML = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Scatter plot of live tokens: market cap against TVL, with the fitted line">' +
      '<line x1="' + X(x0).toFixed(1) + '" y1="' + Y(line(x0)).toFixed(1) + '" x2="' + X(x1).toFixed(1) + '" y2="' + Y(line(x1)).toFixed(1) + '" stroke="#1d2b26" stroke-width="1.5"/>' +
      dots +
      '<text x="' + (W / 2) + '" y="' + (H - 8) + '" text-anchor="middle" font-size="11" fill="#5f6d66">log TVL →</text>' +
      '<text x="12" y="' + (H / 2) + '" text-anchor="middle" font-size="11" fill="#5f6d66" transform="rotate(-90 12 ' + (H / 2) + ')">log market cap →</text>' +
      '</svg>' +
      '<p class="scatter-note">Each dot is one of the ' + pts.length + ' live tokens the model trained on; the line is the fitted value at median growth, age and chains. The scatter is the honest picture: TVL explains some of value, not most of it (R² ' + D.fitted.r_squared.toFixed(2) + ').</p>';
  })();

  // ------------------------------------------------------------ state
  var state = { q: '', category: '', chain: '', verdict: '', tab: 'pre', sort: 'launch_rank', dir: 1, selected: null };
  function readHash() {
    var h = new URLSearchParams(location.hash.slice(1));
    state.q = h.get('q') || '';
    state.category = h.get('category') || '';
    state.chain = h.get('chain') || '';
    state.verdict = h.get('verdict') || '';
    state.tab = h.get('tab') === 'live' ? 'live' : 'pre';
    state.selected = h.get('p') || null;
  }
  function writeHash() {
    var h = new URLSearchParams();
    if (state.q) h.set('q', state.q);
    if (state.category) h.set('category', state.category);
    if (state.chain) h.set('chain', state.chain);
    if (state.verdict) h.set('verdict', state.verdict);
    if (state.tab === 'live') h.set('tab', 'live');
    if (state.selected) h.set('p', state.selected);
    var s = h.toString();
    history.replaceState(null, '', s ? '#' + s : location.pathname + location.search);
  }

  // ------------------------------------------------------------ controls
  var categories = [];
  var chains = [];
  pre.concat(live).concat(D.live_unpriced).forEach(function (r) {
    if (r.category && categories.indexOf(r.category) < 0) categories.push(r.category);
    r.chains.forEach(function (c) { if (chains.indexOf(c) < 0) chains.push(c); });
  });
  categories.sort();
  chains.sort();
  categories.forEach(function (c) {
    var o = document.createElement('option');
    o.value = c; o.textContent = c;
    $('category').appendChild(o);
  });
  chains.forEach(function (c) {
    var o = document.createElement('option');
    o.value = c; o.textContent = c;
    $('chain').appendChild(o);
  });
  $('q').addEventListener('input', function () { state.q = $('q').value; state.selected = null; writeHash(); render(); });
  $('category').addEventListener('change', function () { state.category = $('category').value; state.selected = null; writeHash(); render(); });
  $('chain').addEventListener('change', function () { state.chain = $('chain').value; state.selected = null; writeHash(); render(); });
  $('verdict').addEventListener('change', function () { state.verdict = $('verdict').value; state.selected = null; writeHash(); render(); });
  $('tab-pre').addEventListener('click', function () { state.tab = 'pre'; state.sort = 'launch_rank'; state.dir = 1; state.selected = null; writeHash(); render(); });
  $('tab-live').addEventListener('click', function () { state.tab = 'live'; state.sort = 'rank'; state.dir = 1; state.selected = null; writeHash(); render(); });
  document.querySelectorAll('th button').forEach(function (b) {
    b.addEventListener('click', function () {
      var key = b.getAttribute('data-sort');
      if (state.sort === key) state.dir = -state.dir;
      else { state.sort = key; state.dir = (key === 'name') ? 1 : -1; }
      render();
    });
  });
  $('detail').addEventListener('close', function () { state.selected = null; writeHash(); });

  // ------------------------------------------------------------ filtering and sorting
  function matches(row) {
    if (state.q) {
      var q = state.q.toLowerCase();
      if (row.name.toLowerCase().indexOf(q) < 0 && row.slug.toLowerCase().indexOf(q) < 0) return false;
    }
    if (state.category && row.category !== state.category) return false;
    if (state.chain && row.chains.indexOf(state.chain) < 0) return false;
    if (state.verdict && row.verdict !== state.verdict) return false;
    return true;
  }
  var VERDICT_ORDER = { farm: 3, thin: 2, skip: 1 };
  function liveMultiple(row) {
    if (!row.mcap_usd || !row.tvl_usd) return null;
    return row.mcap_usd / row.tvl_usd;
  }
  function sortValue(row, key) {
    if (key === 'name') return row.name.toLowerCase();
    if (key === 'change_7d') return row.change_7d === null ? -Infinity : row.change_7d;
    if (key === 'age_days') return row.age_days === null ? -1 : row.age_days;
    if (key === 'launch_odds') return row.launch_odds === undefined ? -1 : row.launch_odds;
    if (key === 'verdict') return VERDICT_ORDER[row.verdict] || 0;
    if (key === 'multiple') { var m = liveMultiple(row); return m === null ? -1 : m; }
    if (key === 'band') {
      if (state.tab === 'live') return row.fitted_value_usd * D.bands.lo_factor;
      return row.p25_usd;
    }
    if (key === 'implied_value_usd') return state.tab === 'live' ? (row.mcap_usd || 0) : row.implied_value_usd;
    return row[key];
  }
  function sortRows(list) {
    var key = state.sort;
    var dir = state.dir;
    return list.slice().sort(function (a, b) {
      var va = sortValue(a, key);
      var vb = sortValue(b, key);
      if (typeof va === 'string') return va < vb ? -dir : va > vb ? dir : 0;
      if (va !== vb) return (va - vb) * dir;
      return a.slug < b.slug ? -1 : 1;
    });
  }

  // ------------------------------------------------------------ why this rank
  function whyLines(row) {
    var lines = [];
    var tr = boardStats.tvlRank[row.slug];
    lines.push('TVL of ' + fmt$(row.tvl_usd) + ' is the ' + ordinal(tr) + '-largest on the board' +
      (tr <= 10 ? ' — size is the main reason it ranks this high.' : '.'));
    var ratio = row.fitted.ratio;
    if (ratio >= boardStats.medianRatio * 2) {
      lines.push('Its fitted multiple of ' + fmtMult(ratio) + ' is more than twice the board median of ' + fmtMult(boardStats.medianRatio) + ' — the fit prices this category and size richly.');
    } else if (ratio <= boardStats.medianRatio / 2) {
      lines.push('Its fitted multiple of ' + fmtMult(ratio) + ' is under half the board median of ' + fmtMult(boardStats.medianRatio) + ' — the fit discounts this category and size.');
    } else {
      lines.push('Its fitted multiple of ' + fmtMult(ratio) + ' sits near the board median of ' + fmtMult(boardStats.medianRatio) + '.');
    }
    if (row.change_7d === null) {
      lines.push('No 7-day change is recorded, so growth counts as neutral in the fit.');
    } else if (row.change_7d > 0) {
      lines.push('It grew ' + fmtPct(row.change_7d) + ' over 7 days, ahead of the board median of ' + fmtPct(boardStats.medianChange) + ' — but the fit barely rewards growth: a TVL spike reads as inflows, not value.');
    } else {
      lines.push('It fell ' + Math.abs(row.change_7d).toFixed(1) + '% over 7 days, against a board median of ' + fmtPct(boardStats.medianChange) + ' — the fit barely punishes a fall.');
    }
    if (row.chains.length >= boardStats.maxChains) {
      lines.push('It runs on ' + row.chains.length + ' chains, the widest reach on the board.');
    } else if (row.chains.length > 1) {
      lines.push('It runs on ' + row.chains.length + ' chains, so reach lifts its fitted value a little.');
    } else {
      lines.push('It runs on a single chain, so reach adds nothing to its fitted value.');
    }
    if (row.age_days === null) {
      lines.push('No listing date is recorded, so the fit counts it as 1 year old.');
    } else if (row.age_days >= boardStats.medianAge) {
      lines.push('At ' + fmtAge(row.age_days) + ' old it is older than the board median of ' + fmtAge(boardStats.medianAge) + ' — and older protocols are cheaper per TVL dollar in the fit.');
    } else {
      lines.push('At ' + fmtAge(row.age_days) + ' old it is younger than the board median of ' + fmtAge(boardStats.medianAge) + '.');
    }
    if (row.launch_odds >= boardStats.medianOdds * 1.5) {
      lines.push('Its launch odds of ' + fmtOdds(row.launch_odds) + ' are well above the board median of ' + fmtOdds(boardStats.medianOdds) + ' — that is what earns its ' + row.verdict + ' verdict.');
    } else if (row.launch_odds <= boardStats.medianOdds / 2) {
      lines.push('Its launch odds of ' + fmtOdds(row.launch_odds) + ' are under half the board median of ' + fmtOdds(boardStats.medianOdds) + ' — that is what holds its verdict to ' + row.verdict + ' despite the value.');
    } else {
      lines.push('Its launch odds of ' + fmtOdds(row.launch_odds) + ' sit near the board median of ' + fmtOdds(boardStats.medianOdds) + '.');
    }
    return lines;
  }

  function verdictBadge(v) {
    return '<span class="verdict ' + v + '">' + v + '</span>';
  }
  function rowHtml(row, maxValue) {
    var isLive = state.tab === 'live';
    var value = isLive ? (row.mcap_usd || 0) : row.implied_value_usd;
    var pct = maxValue > 0 ? Math.max(2, Math.round((value / maxValue) * 100)) : 0;
    var changeCls = row.change_7d === null ? '' : row.change_7d >= 0 ? 'up' : 'down';
    var rank = isLive ? String(row.rank) : String(row.launch_rank);
    var rankCell = (!isLive && row.launch_rank <= 3) ? '<span class="rank-badge">' + rank + '</span>' : rank;
    var rowCls = (!isLive && row.launch_rank <= 3) ? ' class="top3"' : '';
    // The tick marks the fitted value inside its own P25–P75 band, on a log scale.
    var tickPct = Math.round((0 - Math.log(D.bands.lo_factor)) / (Math.log(D.bands.hi_factor) - Math.log(D.bands.lo_factor)) * 100);
    var bandCell;
    if (isLive) {
      var blo = Math.max(1, Math.round(row.fitted_value_usd * D.bands.lo_factor));
      var bhi = Math.max(1, Math.round(row.fitted_value_usd * D.bands.hi_factor));
      bandCell = '<td class="num">' + fmtShort(blo) + '–' + fmtShort(bhi) + '<span class="bandbar"><i style="left:' + tickPct + '%"></i></span></td>';
    } else {
      bandCell = '<td class="num">' + fmtShort(row.p25_usd) + '–' + fmtShort(row.p75_usd) + '<span class="bandbar"><i style="left:' + tickPct + '%"></i></span></td>';
    }
    var mid;
    if (isLive) {
      var m = liveMultiple(row);
      mid = '<td class="num">' + (m === null ? '—' : fmtMult(m)) + '</td>';
    } else {
      mid = '<td class="num">' + fmtOdds(row.launch_odds) + '</td><td class="verdict-cell">' + verdictBadge(row.verdict) + '<span class="exp">exp ' + fmtShort(row.expected_value_usd) + '</span></td>';
    }
    return '<tr' + rowCls + '>' +
      '<td class="num">' + rankCell + '</td>' +
      '<td class="proto"><button data-slug="' + esc(row.slug) + '">' + esc(row.name) + '</button>' +
      '<span class="sub">' + esc(row.slug) + (row.category ? ' · ' + esc(row.category) : '') + '</span>' +
      '<span class="sub">' + esc(row.chains.join(', ') || '—') + '</span></td>' +
      '<td class="num">' + fmt$(row.tvl_usd) + '</td>' +
      '<td class="num ' + changeCls + '">' + fmtPct(row.change_7d) + '</td>' +
      '<td class="num">' + fmtAge(row.age_days) + '</td>' +
      mid +
      '<td class="num">' + fmt$(value) + '<span class="bar"><i style="width:' + pct + '%"></i></span></td>' +
      bandCell + '</tr>';
  }

  function render() {
    $('q').value = state.q;
    $('category').value = state.category;
    $('chain').value = state.chain;
    $('verdict').value = state.verdict;
    $('tab-pre').setAttribute('aria-selected', state.tab === 'pre' ? 'true' : 'false');
    $('tab-live').setAttribute('aria-selected', state.tab === 'live' ? 'true' : 'false');
    var isLive = state.tab === 'live';
    var source = isLive ? live : pre;
    var list = sortRows(source.filter(matches));
    var maxValue = 0;
    list.forEach(function (r) {
      var v = isLive ? (r.mcap_usd || 0) : r.implied_value_usd;
      if (v > maxValue) maxValue = v;
    });
    $('count').textContent = 'Showing ' + list.length + ' of ' + source.length + ' ' +
      (isLive ? 'live-token protocols · market caps, not model values' : 'pre-token launches · ' + D.watchlist_size + ' watchlist slugs covered');
    var heads = document.querySelectorAll('#table thead th');
    heads[0].querySelector('button').textContent = isLive ? 'Rank' : 'Launch rank';
    heads[5].querySelector('button').textContent = isLive ? 'Mcap / TVL' : 'Launch odds';
    heads[5].querySelector('button').setAttribute('data-sort', isLive ? 'multiple' : 'launch_odds');
    heads[6].style.display = isLive ? 'none' : '';
    heads[6].querySelector('button').textContent = 'Verdict';
    heads[7].querySelector('button').textContent = isLive ? 'Market cap' : 'Implied value';
    $('rows').innerHTML = list.map(function (r) { return rowHtml(r, maxValue); }).join('');
    $('empty').hidden = list.length > 0;
    $('rows').querySelectorAll('button[data-slug]').forEach(function (b) {
      b.addEventListener('click', function () { openDetail(b.getAttribute('data-slug')); });
    });
    var unpriced = $('unpriced');
    if (unpriced) unpriced.hidden = !isLive;
    if (state.selected) {
      var found = (isLive ? live : pre).find(function (r) { return r.slug === state.selected; });
      if (found) openDetail(state.selected, true);
    } else {
      var dlg = $('detail');
      if (dlg.open) dlg.close();
    }
  }

  function planHtml(p) {
    var html = '<ol class="plan">';
    farmSteps(p).forEach(function (s) {
      var parts = s.match(/^(.*?) Cost: (.*?) Time: (.*?)\.$/);
      if (parts) {
        var cost = parts[2].replace(/\.$/, '');
        var time = parts[3].replace(/\.$/, '');
        html += '<li>' + esc(parts[1]) + ' <span class="cost">Cost: ' + esc(cost) + '. Time: ' + esc(time) + '.</span></li>';
      } else {
        html += '<li>' + esc(s) + '</li>';
      }
    });
    return html + '</ol>';
  }

  function openDetail(slug, fromHash) {
    var isLive = state.tab === 'live';
    var row = (isLive ? live : pre).find(function (r) { return r.slug === slug; });
    if (!row) return;
    state.selected = slug;
    if (!fromHash) writeHash();
    var body = $('detail-body');
    var html = '<h2>' + esc(row.name) + '</h2>' +
      '<p class="meta">' + (isLive ? 'Board rank #' + row.rank + ' of ' + D.board_size + ' · live token' : 'Launch rank #' + row.launch_rank + ' of ' + pre.length + ' · board rank #' + row.rank + ' of ' + D.board_size) +
      ' · ' + esc(row.category || 'Uncategorised') + ' · ' + esc(row.chains.join(', ') || '—') +
      (row.listed_at ? ' · listed ' + esc(row.listed_at) : '') + '</p>';
    if (isLive) {
      var m = liveMultiple(row);
      var f = row.fitted_value_usd;
      html += '<h3>What the market says</h3>' +
        '<p>This protocol already has a token, so the board shows the market’s own value, not a model’s guess. ' +
        'Market cap ' + fmt$(row.mcap_usd || 0) + ' on ' + fmt$(row.tvl_usd) + ' of TVL' +
        (m === null ? '.' : ', a market multiple of ' + fmtMult(m) + '.') + '</p>';
      if (f !== undefined && f !== null) {
        var ratio = row.mcap_usd / f;
        html += '<h3>Model check</h3><p>The fitted model prices this token at ' + fmt$(f) + ' from its TVL, growth, age and chains — the market says ' +
          fmt$(row.mcap_usd) + ', ' + fmtNum(ratio, 2) + '× the model. The model’s P25–P75 band around that price is ' +
          fmt$(Math.max(1, Math.round(f * D.bands.lo_factor))) + '–' + fmt$(Math.max(1, Math.round(f * D.bands.hi_factor))) + '. This token trained the model, so the gap here is smaller than on unseen tokens; the held-out tests are in “How the model was tested”.</p>';
      }
      html += '<h3>Farm plan (post-launch)</h3>' + planHtml(row);
    } else {
      var fit = row.fitted;
      var recomputed = Math.max(1, Math.round(row.tvl_usd * fit.ratio));
      var ok = recomputed === row.implied_value_usd;
      var off = D.fitted.offsets[row.category];
      var offNote = off !== undefined
        ? 'Category offset ' + (off >= 0 ? '+' : '') + fmtNum(off, 2) + ' log points, from ' + (D.fitted.offset_counts[row.category] || 0) + ' live ' + row.category + ' tokens.'
        : 'No category offset — too few live ' + (row.category || 'uncategorised') + ' tokens; the global fit speaks for it.';
      var frow = function (factor, value, note) {
        return '<tr><td>' + esc(factor) + '</td><td class="num">' + esc(value) + '</td><td>' + esc(note) + '</td></tr>';
      };
      var gasTotal = (row.chains.some(function (c) { return c === 'Ethereum' || c === 'Bitcoin'; }) ? D.model.gas_expensive : D.model.gas_cheap);
      var eff = row.expected_value_usd / (capitalFor(row) + gasTotal);
      var third = eff >= D.verdicts.farm_at_or_above ? 'top' : eff >= D.verdicts.thin_at_or_above ? 'middle' : 'bottom';
      html += '<p class="verdict-line">Verdict: ' + verdictBadge(row.verdict) + ' · expected launch value ' + fmt$(row.expected_value_usd) +
        ' (implied value × launch odds). Its expected value per dollar of farm cost sits in the ' + third +
        ' third of the board, so the same capital earns more on higher-ranked rows. The verdict compares rows with each other; it does not promise dollars.</p>';
      html += '<h3>Implied launch value — fitted</h3><table class="factors"><thead><tr><th>Term</th><th>Value</th><th>What it means</th></tr></thead><tbody>' +
        frow('Intercept', fmtNum(fit.intercept, 2), 'The fit’s base level, from ' + D.fitted.comparables + ' live tokens.') +
        frow('+ 0.36 × log TVL', fmtNum(fit.log_tvl_term, 2), 'TVL ' + fmt$(row.tvl_usd) + '. Value grows slower than TVL: doubling TVL adds 28%, not 100%.') +
        frow('− 0.10 × growth', fmtNum(fit.growth_term, 2), '7-day change ' + (row.change_7d === null ? 'not recorded' : fmtPct(row.change_7d)) + '. The fit barely moves on growth — a spike reads as inflows.') +
        frow('− 0.12 × log age', fmtNum(fit.age_term, 2), 'Age ' + fmtAge(row.age_days) + (row.age_days === null ? ' (no listing date: counts as 1 year)' : '') + '. Older protocols are cheaper per TVL dollar.') +
        frow('− 0.15 × log chains', fmtNum(fit.chains_term, 2), row.chains.length + ' chain' + (row.chains.length === 1 ? '' : 's') + '. Reach adds less than the old rule claimed.') +
        frow('+ Category offset', fmtNum(fit.category_offset, 2), offNote) +
        '<tr class="result"><td>= Predicted log mcap</td><td class="num">' + fmtNum(fit.log_mcap, 2) + '</td><td>exp of this is the implied value, ' + fmt$(row.implied_value_usd) + ' — ' + fmtMult(fit.ratio) + '× TVL.</td></tr>' +
        '<tr class="check"><td colspan="3">Recomputed from the fitted multiple: ' + fmt$(recomputed) + (ok ? ' — matches the board value.' : ' — differs by ' + fmt$(Math.abs(recomputed - row.implied_value_usd)) + '.') + (fit.clamped ? ' The safety clamp bound this row.' : '') + '</td></tr>' +
        '</tbody></table>';
      html += '<p class="band-note">P25–P75 band: ' + fmt$(row.p25_usd) + '–' + fmt$(row.p75_usd) + ' — half of the held-out tokens land inside their own band, which spans ×' + fmtNum(D.bands.lo_factor, 2) + ' to ×' + fmtNum(D.bands.hi_factor, 2) + ' of the fitted value. The band is wide because launch values are hard to predict; the point estimate is the middle of it.</p>';
      var band = D.odds.bands;
      var age = row.age_days;
      var bandOdds = age === null ? D.odds.unknown_odds : age < 180 ? band[0].odds : age < 365 ? band[1].odds : age < 730 ? band[2].odds : age < 1095 ? band[3].odds : band[4].odds;
      var mult = D.odds.category_multipliers[row.category];
      var multText = mult !== undefined ? ' × ' + fmtNum(mult, 2) + ' (' + esc(row.category) + ' multiplier)' : '';
      html += '<h3>Launch odds — ' + fmtOdds(row.launch_odds) + '</h3><p>A base rate from the snapshot’s own record, not a forecast. ' +
        'Of the protocols tracked 3 years or more, ' + Math.round(D.odds.mature_rate * 100) + '% record a token — taken as the eventual rate. ' +
        'A still pre-token protocol in the ' + (age === null ? 'unknown-age' : age < 180 ? 'under 6 months' : age < 365 ? '6–12 months' : age < 730 ? '1–2 years' : age < 1095 ? '2–3 years' : '3 years or more') +
        ' band carries life-table odds of ' + fmtOdds(bandOdds) + multText + ' = ' + fmtOdds(row.launch_odds) + '. ' +
        'The 2021–2023 cohorts launched far more often than the 2026 cohort has so far: if the current regime persists, these odds overstate young protocols.</p>';
      html += '<h3>Why this rank</h3><ul class="why">';
      whyLines(row).forEach(function (s) { html += '<li>' + esc(s) + '</li>'; });
      html += '</ul>';
      html += '<h3>Farm plan</h3>' + planHtml(row);
    }
    body.innerHTML = html;
    var dlg = $('detail');
    if (!dlg.open) dlg.showModal();
  }

  // ------------------------------------------------------------ unpriced list
  (function unpriced() {
    var el = $('unpriced-list');
    if (!el) return;
    el.textContent = D.live_unpriced.map(function (r) { return r.name; }).join(', ');
    $('unpriced-count').textContent = String(D.live_unpriced.length);
  })();

  window.addEventListener('hashchange', function () { readHash(); render(); });
  readHash();
  render();
})();
