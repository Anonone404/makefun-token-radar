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
  var fmtPct = function (n) {
    if (n === null || n === undefined) return '—';
    return (n > 0 ? '+' : '') + n.toFixed(1) + '%';
  };
  var fmtAge = function (days) {
    if (days === null || days === undefined) return '—';
    if (days < 365) return days + 'd';
    return (days / 365).toFixed(1) + 'y';
  };
  var fmtMult = function (n) { return n.toFixed(2); };

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

  // ------------------------------------------------------------ model
  function impliedOf(row) {
    return Math.max(1, Math.round(row.tvl_usd * row.category_multiple * row.growth_multiplier * row.maturity_multiplier * row.breadth_multiplier));
  }
  function liveMultiple(row) {
    if (!row.mcap_usd || !row.tvl_usd) return null;
    return row.mcap_usd / row.tvl_usd;
  }

  // ------------------------------------------------------------ state
  var state = { q: '', category: '', chain: '', tab: 'pre', sort: 'implied_value_usd', dir: -1, selected: null };
  function readHash() {
    var h = new URLSearchParams(location.hash.slice(1));
    state.q = h.get('q') || '';
    state.category = h.get('category') || '';
    state.chain = h.get('chain') || '';
    state.tab = h.get('tab') === 'live' ? 'live' : 'pre';
    state.selected = h.get('p') || null;
  }
  function writeHash() {
    var h = new URLSearchParams();
    if (state.q) h.set('q', state.q);
    if (state.category) h.set('category', state.category);
    if (state.chain) h.set('chain', state.chain);
    if (state.tab === 'live') h.set('tab', 'live');
    if (state.selected) h.set('p', state.selected);
    var s = h.toString();
    history.replaceState(null, '', s ? '#' + s : location.pathname + location.search);
  }

  // ------------------------------------------------------------ controls
  var categories = [];
  var chains = [];
  D.rows.concat(D.live).forEach(function (r) {
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
  $('tab-pre').addEventListener('click', function () { state.tab = 'pre'; state.selected = null; writeHash(); render(); });
  $('tab-live').addEventListener('click', function () { state.tab = 'live'; state.selected = null; writeHash(); render(); });
  document.querySelectorAll('th button').forEach(function (b) {
    b.addEventListener('click', function () {
      var key = b.getAttribute('data-sort');
      if (state.sort === key) state.dir = -state.dir;
      else { state.sort = key; state.dir = key === 'name' ? 1 : -1; }
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
    return true;
  }
  function sortValue(row, key) {
    if (key === 'name') return row.name.toLowerCase();
    if (key === 'change_7d') return row.change_7d === null ? -Infinity : row.change_7d;
    if (key === 'age_days') return row.age_days === null ? -1 : row.age_days;
    if (key === 'category_multiple') {
      if (state.tab === 'live') { var m = liveMultiple(row); return m === null ? -1 : m; }
      return row.category_multiple;
    }
    if (key === 'implied_value_usd') return state.tab === 'live' ? (row.mcap_usd || 0) : row.implied_value_usd;
    if (key === 'token') return state.tab === 'live' ? 1 : 0;
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

  // ------------------------------------------------------------ rendering
  var top = D.rows[0];
  $('lede').textContent = 'As of ' + D.as_of + ': ' + D.board_size + ' pre-token protocols ranked — ' + D.watchlist_size +
    ' from the watchlist and ' + D.early_size + ' more the same rule keeps — plus ' + D.live_size +
    ' live-token protocols for comparison. Top: ' + top.name + ' at ' + fmt$(top.implied_value_usd) + '.';
  $('asof').textContent = D.as_of;
  $('asof2').textContent = D.as_of;

  function rowHtml(row, maxValue) {
    var live = state.tab === 'live';
    var value = live ? (row.mcap_usd || 0) : row.implied_value_usd;
    var pct = maxValue > 0 ? Math.max(2, Math.round((value / maxValue) * 100)) : 0;
    var mult = live ? liveMultiple(row) : row.category_multiple;
    var changeCls = row.change_7d === null ? '' : row.change_7d >= 0 ? 'up' : 'down';
    var age = live ? '—' : fmtAge(row.age_days);
    var rank = live ? '—' : String(row.rank);
    var tag = live ? '<span class="tag live">Live token</span>' : '<span class="tag">Pre-token</span>';
    return '<tr>' +
      '<td class="num">' + rank + '</td>' +
      '<td class="proto"><button data-slug="' + esc(row.slug) + '">' + esc(row.name) + '</button>' +
      '<span class="sub">' + esc(row.slug) + (row.category ? ' · ' + esc(row.category) : '') + '</span>' +
      '<span class="sub">' + esc(row.chains.join(', ') || '—') + '</span></td>' +
      '<td class="num">' + fmt$(row.tvl_usd) + '</td>' +
      '<td class="num ' + changeCls + '">' + fmtPct(row.change_7d) + '</td>' +
      '<td class="num">' + age + '</td>' +
      '<td class="num">' + (mult === null ? '—' : fmtMult(mult)) + '</td>' +
      '<td class="num">' + fmt$(value) + '<span class="bar"><i style="width:' + pct + '%"></i></span></td>' +
      '<td>' + tag + '</td></tr>';
  }

  function render() {
    $('q').value = state.q;
    $('category').value = state.category;
    $('chain').value = state.chain;
    $('tab-pre').setAttribute('aria-selected', state.tab === 'pre' ? 'true' : 'false');
    $('tab-live').setAttribute('aria-selected', state.tab === 'live' ? 'true' : 'false');
    var source = state.tab === 'live' ? D.live : D.rows;
    var list = sortRows(source.filter(matches));
    var maxValue = 0;
    list.forEach(function (r) {
      var v = state.tab === 'live' ? (r.mcap_usd || 0) : r.implied_value_usd;
      if (v > maxValue) maxValue = v;
    });
    var total = source.length;
    $('count').textContent = 'Showing ' + list.length + ' of ' + total + ' ' +
      (state.tab === 'live' ? 'live-token protocols' : 'pre-token protocols') +
      (state.tab === 'pre' ? ' · ' + D.watchlist_size + ' watchlist slugs covered' : ' · market caps, not model values');
    document.querySelector('th button[data-sort="implied_value_usd"]').textContent =
      state.tab === 'live' ? 'Market cap' : 'Implied value';
    $('rows').innerHTML = list.map(function (r) { return rowHtml(r, maxValue); }).join('');
    $('empty').hidden = list.length > 0;
    $('rows').querySelectorAll('button[data-slug]').forEach(function (b) {
      b.addEventListener('click', function () { openDetail(b.getAttribute('data-slug')); });
    });
    if (state.selected) {
      var found = (state.tab === 'live' ? D.live : D.rows).find(function (r) { return r.slug === state.selected; });
      if (found) openDetail(state.selected, true);
    } else {
      var dlg = $('detail');
      if (dlg.open) dlg.close();
    }
  }

  function openDetail(slug, fromHash) {
    var live = state.tab === 'live';
    var row = (live ? D.live : D.rows).find(function (r) { return r.slug === slug; });
    if (!row) return;
    state.selected = slug;
    if (!fromHash) writeHash();
    var body = $('detail-body');
    var html = '<h2>' + esc(row.name) + '</h2>' +
      '<p class="meta">Rank ' + (live ? '— (live token)' : '#' + row.rank) + ' · ' + esc(row.category || 'Uncategorised') +
      ' · ' + esc(row.chains.join(', ') || '—') +
      (row.listed_at ? ' · listed ' + esc(row.listed_at) : '') + '</p>';
    if (live) {
      var m = liveMultiple(row);
      html += '<h3>What the market says</h3>' +
        '<p>This protocol already has a token, so the board shows the market’s own value, not a model’s guess. ' +
        'Market cap ' + fmt$(row.mcap_usd || 0) + ' on ' + fmt$(row.tvl_usd) + ' of TVL' +
        (m === null ? '.' : ', a market multiple of ' + fmtMult(m) + ' — the same kind of multiple the ranking model reads from live tokens.') +
        '</p><p>No farm plan: the token already trades.</p>';
    } else {
      var recomputed = impliedOf(row);
      var ok = recomputed === row.implied_value_usd;
      var catNote = D.multiples.by_category[row.category] !== undefined
        ? 'median mcap/TVL of the ' + row.category + ' live tokens in this snapshot'
        : 'snapshot-wide median mcap/TVL (too few live ' + (row.category || 'uncategorised') + ' comparables)';
      var pad = function (s, n) { return (s + ' '.repeat(n)).slice(0, n); };
      var lines = [
        pad('TVL', 22) + fmt$(row.tvl_usd),
        pad('× category multiple', 22) + fmtMult(row.category_multiple) + '  (' + catNote + ')',
        pad('× growth multiplier', 22) + row.growth_multiplier.toFixed(4) + '  (7-day change ' + fmtPct(row.change_7d) + ')',
        pad('× maturity multiplier', 22) + row.maturity_multiplier.toFixed(4) + '  (age ' + fmtAge(row.age_days) + (row.age_days === null ? ', no listing date: counts as 1 year' : '') + ')',
        pad('× breadth multiplier', 22) + row.breadth_multiplier.toFixed(4) + '  (' + row.chains.length + ' chain' + (row.chains.length === 1 ? '' : 's') + ')',
        pad('= implied value', 22) + fmt$(row.implied_value_usd),
        'Recomputed from these factors: ' + fmt$(recomputed) + (ok ? ' — matches the board value.' : ' — differs by ' + fmt$(Math.abs(recomputed - row.implied_value_usd)) + '.')
      ];
      html += '<h3>Implied launch value</h3><div class="equation">' +
        esc(lines.slice(0, 5).join('\n')) + '\n' +
        '<span class="result">' + esc(lines[5]) + '</span>\n' +
        esc(lines[6]) +
        '</div>';
      html += '<h3>Farm plan</h3><ol>';
      farmSteps(row).forEach(function (s) {
        var parts = s.match(/^(.*?) Cost: (.*?) Time: (.*?)\.$/);
        if (parts) {
          var cost = parts[2].replace(/\.$/, '');
          var time = parts[3].replace(/\.$/, '');
          html += '<li>' + esc(parts[1]) + ' <span class="cost">Cost: ' + esc(cost) + '. Time: ' + esc(time) + '.</span></li>';
        } else {
          html += '<li>' + esc(s) + '</li>';
        }
      });
      html += '</ol>';
    }
    body.innerHTML = html;
    var dlg = $('detail');
    if (!dlg.open) dlg.showModal();
  }

  window.addEventListener('hashchange', function () { readHash(); render(); });
  readHash();
  render();
})();
