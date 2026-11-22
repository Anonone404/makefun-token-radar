// Token Radar model, version radar-2.
//
// One sealed snapshot of the protocol universe in, one ranked board out.
// The board covers every slug in the snapshot's watchlist (the floor, never
// a ceiling) and every other pre-token protocol the snapshot's own rule
// would keep: no token on record, and not a wrapped, staked, bridged or
// exchange product of a token that already trades. Live-token protocols are
// kept apart and shown with the market's own values, never mixed into the
// ranked board.
//
// Implied value follows only from the snapshot's own figures:
//
//   category multiple = median market-cap / TVL of the live-token
//     protocols in the same category, read from this same snapshot
//     (at least 3 comparables, else the snapshot-wide median),
//     clamped to [0.05, 0.60]
//   base       = tvl_usd x category multiple
//   growth     = clamp(change_7d, -60, 120) per cent
//   growthMult = 1 + (growth / 100) x 0.5
//   maturity   = 0.6 + min(age_days, 1095) / 1095 x 0.4   (age unknown: 365)
//   breadth    = 1 + 0.02 x min(chains - 1, 10), at most 1.20
//   implied    = max(1, round(base x growthMult x maturity x breadth))
//
// No protocol name is ever special-cased: the same function scores every
// row, and the category multiple is a median of live markets, not a
// hand-picked number.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's constants, as the dashboard states them. */
export interface ModelConstants {
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  unknown_age_days: number;
  multiple_floor: number;
  multiple_cap: number;
  min_comparables: number;
  breadth_step: number;
  breadth_max: number;
}

export const MODEL: ModelConstants = {
  growth_weight: 0.5,
  growth_floor: -60,
  growth_cap: 120,
  maturity_floor: 0.6,
  maturity_range: 0.4,
  maturity_days: 1095,
  unknown_age_days: 365,
  multiple_floor: 0.05,
  multiple_cap: 0.6,
  min_comparables: 3,
  breadth_step: 0.02,
  breadth_max: 0.2,
};

/** The model's version label: the dashboard names it. */
export const MODEL_VERSION = 'radar-2';

/** How many live-token protocols the Live token view carries, by market cap. */
export const LIVE_ROWS = 24;

/** Categories whose products are a wrapped, staked, bridged or exchange form of a token that already trades. */
export const EXCLUDED_CATEGORIES: ReadonlySet<string> = new Set([
  'Bridge',
  'Canonical Bridge',
  'Liquid Staking',
  'Liquid Restaking',
  'Restaked BTC',
  'CEX',
]);

/** Exchange names: a protocol beginning with one is the exchange's own product. */
export const EXCHANGE_PREFIXES: readonly string[] = [
  'Binance',
  'Coinbase',
  'Bybit',
  'Kraken',
  'Bitget',
  'OKX',
  'Bitfinex',
  'Gemini',
];

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  model: {
    category_multiple: number;
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    breadth_multiplier: number;
    age_days: number | null;
  };
  farm_steps: string[];
}

/** The dashboard's compact view of one row, with farm plans generated in the page. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  category_multiple: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  breadth_multiplier: number;
}

/** A live-token protocol: it already trades, so the board shows the market's own value, not a model's. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

/** The category multiples the model read from the snapshot's live tokens. */
export interface CategoryMultiples {
  by_category: Record<string, number>;
  global: number;
}

/** Everything the dashboard needs: the board, the live set, and the model it runs. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  multiples: CategoryMultiples;
  rows: RadarRow[];
  live: LiveRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;
const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** The median of a non-empty list of numbers. */
export function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid]!;
  return (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** A name carrying a whole word wrapped, staked or staking, in any case. */
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/**
 * Whether a protocol is a wrapped, staked, bridged or exchange product of a
 * token that already trades: the snapshot's own watchlist rule, applied to
 * every ranked row and not only to the watchlist itself.
 */
export function isExcludedProduct(p: SnapshotProtocol): boolean {
  if (p.category !== null && EXCLUDED_CATEGORIES.has(p.category)) return true;
  if (VERSIONED.test(p.name)) return true;
  if (WRAPPED_WORD.test(p.name)) return true;
  for (const prefix of EXCHANGE_PREFIXES) {
    if (p.name === prefix || p.name.startsWith(`${prefix} `)) return true;
  }
  return false;
}

/** Whether a protocol is one the board may rank: pre-token and not an excluded product. */
export function isRankable(p: SnapshotProtocol): boolean {
  return isPreToken(p) && !isExcludedProduct(p);
}

/** Whether a protocol is a clean live-token comparable for a category multiple. */
function isComparable(p: SnapshotProtocol): boolean {
  if (p.mcap_usd === null || p.mcap_usd <= 0) return false;
  if (p.tvl_usd <= 0) return false;
  if (p.category === null) return false;
  if (isExcludedProduct(p)) return false;
  return true;
}

/**
 * The category multiples, read from the snapshot's own live tokens: for each
 * category with at least `min_comparables` clean comparables, the median of
 * their market-cap / TVL; plus the snapshot-wide median as the fallback.
 * Every multiple is clamped to [multiple_floor, multiple_cap].
 */
export function categoryMultiples(snapshot: Snapshot, model: ModelConstants = MODEL): CategoryMultiples {
  const byCategory = new Map<string, number[]>();
  const all: number[] = [];
  for (const p of snapshot.protocols) {
    if (!isComparable(p)) continue;
    const ratio = (p.mcap_usd as number) / p.tvl_usd;
    if (!Number.isFinite(ratio) || ratio <= 0) continue;
    all.push(ratio);
    const list = byCategory.get(p.category as string) ?? [];
    list.push(ratio);
    byCategory.set(p.category as string, list);
  }
  const clamp = (v: number): number => Math.min(model.multiple_cap, Math.max(model.multiple_floor, v));
  const out: Record<string, number> = {};
  for (const [category, ratios] of byCategory) {
    if (ratios.length >= model.min_comparables) out[category] = round4(clamp(median(ratios)));
  }
  const global = all.length > 0 ? round4(clamp(median(all))) : 0.25;
  return { by_category: out, global };
}

/** The five factors and the implied value one protocol gets under `model`. */
export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  model: ModelConstants,
  multiples: CategoryMultiples,
): { implied: number; categoryMultiple: number; growthPct: number; growthMult: number; maturityMult: number; breadthMult: number; age: number | null } {
  const age = ageDays(asOf, protocol.listed_at);
  const rawMultiple = protocol.category !== null && multiples.by_category[protocol.category] !== undefined
    ? multiples.by_category[protocol.category]!
    : multiples.global;
  const categoryMultiple = Math.min(model.multiple_cap, Math.max(model.multiple_floor, rawMultiple));
  const rawGrowth = finite(protocol.change_7d, 0);
  const growthPct = Math.min(model.growth_cap, Math.max(model.growth_floor, rawGrowth));
  const growthMult = 1 + (growthPct / 100) * model.growth_weight;
  const ageForModel = age ?? model.unknown_age_days;
  const maturityMult = model.maturity_floor + (Math.min(Math.max(ageForModel, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
  const extraChains = Math.min(Math.max(protocol.chains.length - 1, 0), 10);
  const breadthMult = 1 + extraChains * model.breadth_step;
  const base = protocol.tvl_usd * categoryMultiple;
  const implied = Math.max(1, Math.round(base * growthMult * maturityMult * breadthMult));
  return { implied, categoryMultiple, growthPct, growthMult, maturityMult, breadthMult, age };
}

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/** The headline sentence's figures: how many watchlist slugs, how many rows, how many live protocols. */
export interface BoardSummary {
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const multiples = categoryMultiples(snapshot, model);
  const index = bySlug(snapshot.protocols);
  const chosen = new Map<string, SnapshotProtocol>();
  // The watchlist is the floor: every slug, even one the snapshot no longer carries (it cannot, but the
  // board's coverage is the gate's row and is never gambled on a missing record).
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // The early radar: every other rankable pre-token protocol, at any TVL the snapshot carries. Never a
  // replacement for a watchlist row: a chosen protocol stays chosen.
  for (const p of snapshot.protocols) {
    if (!chosen.has(p.slug) && isRankable(p)) chosen.set(p.slug, p);
  }

  const scored = [...chosen.values()].map((p) => {
    const v = impliedValue(p, snapshot.as_of, model, multiples);
    return { p, ...v };
  });
  scored.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id,
    symbol: s.p.symbol,
    token_status: 'pre-token',
    age_days: s.age,
    implied_value_usd: s.implied,
    model: {
      category_multiple: s.categoryMultiple,
      growth_pct: s.growthPct,
      growth_multiplier: round4(s.growthMult),
      maturity_multiplier: round4(s.maturityMult),
      breadth_multiplier: round4(s.breadthMult),
      age_days: s.age,
    },
    farm_steps: farmSteps(s.p, s.age).map(stepText),
  }));
}

/** The first chain a protocol runs on; 'Ethereum' when the snapshot carries none. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains[0] ?? 'Ethereum';
}

/** The capital a farm position takes, by the protocol's size. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 1_000_000_000) return 250;
  if (p.tvl_usd >= 500_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}

/** The gas a single on-chain action costs on the protocol's chain, before the transaction fee itself. */
function gasFor(p: SnapshotProtocol): string {
  const expensive = p.chains.some((c) => c === 'Ethereum' || c === 'Bitcoin');
  if (expensive) return '$8–$25';
  if (p.tvl_usd >= 500_000_000) return '$6–$12';
  return '$2–$8';
}

/** How long a position is held before it is touched again, by the protocol's age. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** The main qualifying action for a category, with the capital and chain named. */
function actionFor(p: SnapshotProtocol, capital: number): string {
  const chain = chainOf(p);
  switch (p.category) {
    case 'Lending':
    case 'CDP':
      return `Supply $${capital} of USDC to the protocol on ${chain} so the wallet has an active supply position`;
    case 'Dexs':
      return `Deposit $${capital} into a liquidity pool on ${chain} and hold the LP position`;
    case 'Yield':
    case 'Yield Aggregator':
    case 'Onchain Capital Allocator':
    case 'Risk Curators':
      return `Deposit $${capital} into the highest-TVL vault on ${chain}`;
    case 'Liquid Staking':
    case 'Restaking':
    case 'Liquid Restaking':
    case 'Restaked BTC':
      return `Stake $${capital} of the base asset through the protocol on ${chain}`;
    case 'Derivatives':
    case 'Options':
      return `Open a $${capital} hedged position on ${chain} and keep it open at least a week`;
    case 'Prediction Market':
      return `Place a $${capital} position in the most liquid market on ${chain}`;
    case 'RWA':
      return `Buy $${capital} of the tokenised asset on ${chain} and hold it`;
    case 'Bridge':
    case 'Canonical Bridge':
      return `Bridge $${capital} of USDC to ${chain} through the protocol`;
    case 'CEX':
      return `Deposit $${capital} of USDC into the exchange account and hold it`;
    case 'Insurance':
      return `Buy $${capital} of cover on ${chain} for a vault the wallet already uses`;
    case 'NFT Lending':
      return `Supply $${capital} of USDC to the lending pool on ${chain}`;
    case 'Stablecoin':
      return `Mint $${capital} of the stablecoin with USDC on ${chain} and hold it`;
    case 'Algo-Stables':
      return `Mint $${capital} of the stablecoin with USDC on ${chain} and hold it`;
    case 'Synthetics':
      return `Mint $${capital} of the synthetic asset on ${chain} and hold it`;
    case 'Farm':
      return `Stake $${capital} of LP tokens in the farm on ${chain}`;
    case 'Leveraged Farming':
      return `Open a $${capital} leveraged farming position on ${chain} with 2x leverage at most`;
    default:
      return `Deposit $${capital} into the protocol's main product on ${chain}`;
  }
}

/** A second, different qualifying action for the same category, so the wallet shows repeat use. */
function secondActionFor(p: SnapshotProtocol): string {
  switch (p.category) {
    case 'Lending':
    case 'CDP':
      return 'Open a small borrow against the supply position and repay it within the same week';
    case 'Dexs':
      return 'Swap a small amount through a pool so the wallet shows both providing and swapping';
    case 'Yield':
    case 'Yield Aggregator':
    case 'Onchain Capital Allocator':
    case 'Risk Curators':
      return 'Move a small part of the vault position into a second vault of the same protocol';
    case 'Liquid Staking':
    case 'Restaking':
    case 'Liquid Restaking':
    case 'Restaked BTC':
      return 'Unstake a small part of the position and stake it again in a second pool';
    case 'Derivatives':
    case 'Options':
      return 'Close the hedge and open one more small position in the opposite direction';
    case 'Prediction Market':
      return 'Settle one market and place a position in a second market';
    case 'RWA':
      return 'Claim any yield the position earned and restake it';
    case 'Bridge':
    case 'Canonical Bridge':
      return 'Bridge a small amount back so the wallet shows activity in both directions';
    case 'Stablecoin':
    case 'Algo-Stables':
      return 'Redeem a small part of the stable position back to USDC, then mint it again';
    case 'Insurance':
      return 'Buy cover for a second vault the wallet already uses';
    case 'Farm':
    case 'Leveraged Farming':
      return 'Harvest the rewards the position earned and stake them again';
    case 'Synthetics':
      return 'Mint a second, different synthetic asset with a small amount';
    case 'NFT Lending':
      return 'Open a small borrow against the supply and repay it within the same week';
    default:
      return 'Use the protocol a second time in a different way, such as a swap, a vote or a second deposit';
  }
}

/** The eight-step farm plan for one protocol. */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const capital = capitalFor(p);
  const gas = gasFor(p);
  const hold = holdDaysFor(age);
  const action = actionFor(p, capital);
  const second = secondActionFor(p);
  const chain = chainOf(p);
  return [
    {
      text: 'Create a fresh wallet for this farm and write the seed phrase down on paper, offline, in one place only.',
      cost: '$0',
      time: '5 minutes',
    },
    {
      text: `${action}.`,
      cost: `$${capital} of capital plus ${gas} of gas`,
      time: '15 minutes',
    },
    {
      text: `${second}.`,
      cost: 'About $10–$25 of capital moved plus $2–$8 of gas',
      time: '10 minutes',
    },
    {
      text: `Repeat one qualifying action each week on ${chain} so the wallet shows a steady pattern instead of one deposit.`,
      cost: 'About $2–$8 of gas per week',
      time: '10 minutes per week',
    },
    {
      text: `Hold the position for at least ${hold} days before touching it again, so the activity reads as a real user.`,
      cost: `The $${capital} stays locked for ${hold} days`,
      time: `${hold} days`,
    },
    {
      text: 'Check the protocol’s own points or rewards page weekly and only claim from a link the protocol itself published; never pay to claim.',
      cost: '$0 to check; gas only if the protocol itself charges for a claim',
      time: '10 minutes',
    },
    {
      text: 'Before approving anything, check the app address and any contract against the protocol’s own docs; never approve an unlimited spend.',
      cost: '$0',
      time: '10 minutes',
    },
    {
      text: 'Write down the wallet address, the dates and the transaction hashes, and decide the exit before withdrawing: unstake, then move funds back to the main wallet.',
      cost: '$0 to log; gas for the exit',
      time: '5 minutes',
    },
  ];
}

/** A farm step as one line: the action, what it costs, and how long it takes. */
function stepText(step: FarmStep): string {
  const line = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  return line.length > 600 ? line.slice(0, 597).trimEnd() + '...' : line;
}

/** The live-token protocols, by market cap, for the Live token view. */
export function liveRows(snapshot: Snapshot, count: number = LIVE_ROWS): LiveRow[] {
  const live = snapshot.protocols.filter((p) => p.mcap_usd !== null && !isExcludedProduct(p));
  live.sort((a, b) => (b.mcap_usd as number) - (a.mcap_usd as number) || (a.slug < b.slug ? -1 : 1));
  return live.slice(0, count).map((p) => ({
    slug: p.slug,
    name: p.name,
    category: p.category,
    chains: p.chains,
    tvl_usd: p.tvl_usd,
    mcap_usd: p.mcap_usd,
    change_7d: p.change_7d,
  }));
}

/** The board, the live set, and the model behind them, ready for the dashboard. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): RadarData {
  const multiples = categoryMultiples(snapshot, model);
  const board = buildBoard(snapshot, model);
  const live = liveRows(snapshot);
  const bySlug = new Map(snapshot.protocols.map((p) => [p.slug, p]));
  const rows: RadarRow[] = board.map((r) => {
    // The page recomputes the implied value from these factors, so they are
    // the raw factors the model used, not the four-decimal display values.
    const v = impliedValue(bySlug.get(r.slug)!, snapshot.as_of, model, multiples);
    return {
      rank: r.rank,
      slug: r.slug,
      name: r.name,
      category: r.category,
      chains: r.chains,
      tvl_usd: r.tvl_usd,
      change_7d: r.change_7d,
      mcap_usd: r.mcap_usd,
      listed_at: r.listed_at,
      age_days: r.age_days,
      implied_value_usd: r.implied_value_usd,
      category_multiple: r.model.category_multiple,
      growth_multiplier: v.growthMult,
      maturity_multiplier: v.maturityMult,
      breadth_multiplier: v.breadthMult,
    };
  });
  return {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: board.length - snapshot.watchlist.length,
    live_size: live.length,
    multiples,
    rows,
    live,
  };
}

/** Parse and validate the sealed snapshot; nothing else in this model reads a file. */
export function parseSnapshot(raw: unknown): Snapshot {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new SnapshotError('snapshot must be a JSON object');
  }
  const doc = raw as Record<string, unknown>;
  const protocols = doc.protocols;
  const watchlist = doc.watchlist;
  if (!Array.isArray(protocols)) throw new SnapshotError('snapshot.protocols must be an array');
  if (!Array.isArray(watchlist)) throw new SnapshotError('snapshot.watchlist must be an array');
  const asOf = typeof doc.as_of === 'string' ? doc.as_of : null;
  const source = typeof doc.source === 'string' ? doc.source : null;
  const floor = typeof doc.floor_usd === 'number' ? doc.floor_usd : null;
  if (asOf === null) throw new SnapshotError('snapshot.as_of must be a string');
  if (source === null) throw new SnapshotError('snapshot.source must be a string');
  if (floor === null || floor <= 0) throw new SnapshotError('snapshot.floor_usd must be a positive number');

  const seen = new Set<string>();
  for (const entry of protocols) {
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new SnapshotError('each snapshot protocol must be an object');
    }
    const p = entry as Record<string, unknown>;
    if (typeof p.slug !== 'string' || p.slug === '') throw new SnapshotError('each protocol needs a slug');
    if (typeof p.name !== 'string' || p.name === '') throw new SnapshotError(`protocol ${p.slug} needs a name`);
    if (seen.has(p.slug)) throw new SnapshotError(`duplicate slug in snapshot: ${p.slug}`);
    seen.add(p.slug);
    const tvl = typeof p.tvl_usd === 'number' ? p.tvl_usd : null;
    if (tvl === null || !Number.isFinite(tvl) || tvl < 0) throw new SnapshotError(`protocol ${p.slug} has a bad tvl_usd`);
    if (p.change_7d !== null && typeof p.change_7d !== 'number') throw new SnapshotError(`protocol ${p.slug} has a bad change_7d`);
    if (p.mcap_usd !== null && (typeof p.mcap_usd !== 'number' || (p.mcap_usd as number) < -1)) throw new SnapshotError(`protocol ${p.slug} has a bad mcap_usd`);
    if (p.category !== null && typeof p.category !== 'string') throw new SnapshotError(`protocol ${p.slug} has a bad category`);
    if (!Array.isArray(p.chains) || p.chains.some((c) => typeof c !== 'string')) throw new SnapshotError(`protocol ${p.slug} has bad chains`);
    if (p.listed_at !== null && typeof p.listed_at !== 'string') throw new SnapshotError(`protocol ${p.slug} has a bad listed_at`);
    if (p.gecko_id !== null && typeof p.gecko_id !== 'string') throw new SnapshotError(`protocol ${p.slug} has a bad gecko_id`);
    if (p.symbol !== null && typeof p.symbol !== 'string') throw new SnapshotError(`protocol ${p.slug} has a bad symbol`);
  }
  for (const slug of watchlist) {
    if (typeof slug !== 'string' || slug === '') throw new SnapshotError('watchlist slugs must be non-empty strings');
    if (!seen.has(slug)) throw new SnapshotError(`watchlist slug is missing from the snapshot: ${slug}`);
  }
  // The snapshot records an unknown market cap as -1: that is "no market cap recorded", not a value.
  for (const entry of protocols) {
    const p = entry as Record<string, unknown>;
    if (p.mcap_usd === -1) p.mcap_usd = null;
  }
  return doc as unknown as Snapshot;
}

/**
 * The gate's own checks on the board, before it is written: every watchlist
 * slug present, ranks exactly 1..n, implied value non-increasing with rank
 * and not all equal, farm steps 3–12 with 20–600 characters each.
 */
export function boardIssue(snapshot: Snapshot, board: BoardRow[]): string | null {
  if (board.length < 100) return `board has ${board.length} rows, fewer than the 100-row minimum`;
  const slugs = new Set(board.map((r) => r.slug));
  for (const slug of snapshot.watchlist) {
    if (!slugs.has(slug)) return `board is missing watchlist slug ${slug}`;
  }
  for (let i = 0; i < board.length; i++) {
    const row = board[i]!;
    if (row.rank !== i + 1) return `row ${row.slug} has rank ${row.rank}, expected ${i + 1}`;
    if (!Number.isSafeInteger(row.implied_value_usd) || row.implied_value_usd <= 0) return `row ${row.slug} has an implied value that is not a positive integer`;
    if (row.implied_value_usd > 1e14) return `row ${row.slug} has an implied value above 1e14`;
    if (i > 0 && row.implied_value_usd > board[i - 1]!.implied_value_usd) return `board is not sorted by implied value at row ${row.slug}`;
    if (row.farm_steps.length < 3 || row.farm_steps.length > 12) return `row ${row.slug} has ${row.farm_steps.length} farm steps`;
    for (const step of row.farm_steps) {
      if (step.length < 20 || step.length > 600) return `row ${row.slug} has a farm step of ${step.length} characters`;
    }
  }
  const values = new Set(board.map((r) => r.implied_value_usd));
  if (values.size === 1) return 'every row has the same implied value';
  return null;
}

/** The data.js the dashboard reads: the radar data as one assignment, no other code. */
export function dataScript(data: RadarData): string {
  return `window.RADAR = ${JSON.stringify(data)};\n`;
}
