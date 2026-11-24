// Token Radar model, version radar-3.
//
// One sealed snapshot of the protocol universe in, one ranked board out.
// The board covers every slug in the snapshot's watchlist (the floor, never
// a ceiling), every other pre-token protocol the snapshot's own rule would
// keep, and every live-token protocol with a market cap on record — 290 rows
// in all. Live rows carry the market's own value, never a model's guess, and
// the dashboard keeps the two sets on separate tabs.
//
// The implied value is FITTED, not hand-set. A ridge regression on the
// snapshot's own live tokens predicts log market cap from log TVL, 7-day
// growth, age and chain count; a shrunk category offset carries what the
// category itself is worth. The fit is then tested, not trusted: leave-one-out
// and walk-forward (older to newer, and newer to older) splits, with the
// scores printed on the dashboard. Launch odds are a life table from the
// snapshot's own record: the share of still pre-token protocols in each age
// band that will still launch, if the oldest cohort's token share is the
// eventual rate, adjusted for the protocol's category. Farm verdicts net the
// expected launch value against the cost of the farm plan.
//
// No protocol name is ever special-cased: the same functions score every row.

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
  /** Ridge penalty on the regression slopes; chosen by leave-one-out among 0, 1 and 10. */
  ridge_lambda: number;
  growth_floor: number;
  growth_cap: number;
  unknown_age_days: number;
  /** Minimum clean comparables for a category offset. */
  min_comparables: number;
  /** Offset shrinkage: a category's mean residual is weighted n / (n + shrink). */
  offset_shrink: number;
  /** Safety clamp on the fitted implied value as a multiple of TVL. */
  ratio_floor: number;
  ratio_cap: number;
  /** Launch-odds floor and cap. */
  odds_floor: number;
  odds_cap: number;
  /** Category multiplier floor and cap for launch odds. */
  category_mult_floor: number;
  category_mult_cap: number;
  /** Minimum mature protocols for a category multiplier. */
  mature_min_n: number;
  /** Total gas across a farm plan on an expensive chain (Ethereum, Bitcoin). */
  gas_expensive: number;
  /** Total gas across a farm plan on any other chain. */
  gas_cheap: number;
}

export const MODEL: ModelConstants = {
  ridge_lambda: 10,
  growth_floor: -60,
  growth_cap: 120,
  unknown_age_days: 365,
  min_comparables: 3,
  offset_shrink: 5,
  ratio_floor: 0.005,
  ratio_cap: 2.0,
  odds_floor: 0.05,
  odds_cap: 0.95,
  category_mult_floor: 0.3,
  category_mult_cap: 2.0,
  mature_min_n: 8,
  gas_expensive: 80,
  gas_cheap: 25,
};

/** The model's version label: the dashboard names it. */
export const MODEL_VERSION = 'radar-3';

/** Walk-forward cutoff: protocols listed before this date train the model, after it test it. */
export const WALK_FORWARD_CUTOFF = '2025-01-01';

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

/** One fitted factor of a pre-token row's implied value, for the detail view. */
export interface FittedFactors {
  /** Predicted log market cap, before the safety clamp. */
  log_mcap: number;
  intercept: number;
  log_tvl_term: number;
  growth_term: number;
  age_term: number;
  chains_term: number;
  category_offset: number;
  /** Implied value as a multiple of TVL, after the clamp. */
  ratio: number;
  /** Whether the safety clamp bound this row. */
  clamped: boolean;
}

/** A farm verdict: farm it, farm it thinly, or skip it. */
export type Verdict = 'farm' | 'thin' | 'skip';

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
  token_status: 'pre-token' | 'live';
  age_days: number | null;
  /** Fitted implied value for a pre-token row; the recorded market cap for a live row. */
  implied_value_usd: number;
  /** Lower edge of the P25–P75 band around the fitted value (pre-token only; null for live rows). */
  p25_usd: number | null;
  /** Upper edge of the P25–P75 band around the fitted value (pre-token only; null for live rows). */
  p75_usd: number | null;
  /** Launch odds for a pre-token row; null for a live row. */
  launch_odds: number | null;
  /** Farm verdict for a pre-token row; null for a live row. */
  verdict: Verdict | null;
  /** Implied value times launch odds, for a pre-token row; null for a live row. */
  expected_value_usd: number | null;
  /** The fitted factors for a pre-token row; null for a live row. */
  model: FittedFactors | null;
  farm_steps: string[];
}

/** The dashboard's compact view of one pre-token row. */
export interface RadarRow {
  rank: number;
  launch_rank: number;
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
  /** Lower edge of the P25–P75 band around the fitted value. */
  p25_usd: number;
  /** Upper edge of the P25–P75 band around the fitted value. */
  p75_usd: number;
  launch_odds: number;
  verdict: Verdict;
  expected_value_usd: number;
  fitted: FittedFactors;
}

/** A live-token protocol, ranked by its recorded market cap. */
export interface LiveRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number;
  change_7d: number | null;
  listed_at: string | null;
  age_days: number | null;
  /** What the fitted model would price this token at, from its own figures. */
  fitted_value_usd: number;
}

/** A protocol that records a token but no market cap: listed, never ranked. */
export interface UnpricedRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
}

/** One term of the fitted model, tested by leaving it out: how much worse both held-out tests get without it. */
export interface TermTest {
  term: string;
  loo_factor: number;
  walk_forward_factor: number;
  kept: boolean;
  note: string;
}

/** The P25–P75 band around a fitted value, from the leave-one-out log errors. */
export interface BandStats {
  /** 25th percentile of (actual − predicted) log market cap over the held-out tokens. */
  loo_q25_log: number;
  /** 75th percentile of (actual − predicted) log market cap over the held-out tokens. */
  loo_q75_log: number;
  /** Multiplicative lower band edge: exp(q25). */
  lo_factor: number;
  /** Multiplicative upper band edge: exp(q75). */
  hi_factor: number;
  /** Share of held-out tokens whose actual market cap falls inside their own band. */
  range_holds: number;
}

/** One validation run: how the fitted model did on protocols it never saw. */
export interface ValidationRun {
  /** What was held out. */
  method: string;
  train_n: number;
  test_n: number;
  /** Median absolute log error on the held-out set. */
  median_abs_log_error: number;
  /** The median error as a multiple (exp of the log error). */
  median_factor: number;
  /** Share of held-out market caps predicted within 2x. */
  within_2x: number;
  /** Mean log error (sign shows over- or under-prediction). */
  bias: number;
  rmse: number;
}

/** The fitted regression, as the dashboard reports it. */
export interface FittedModel {
  /** Regression coefficients: intercept, log TVL, growth, log age, log chains. */
  coefficients: number[];
  /** How many clean live-token comparables the fit trained on. */
  comparables: number;
  /** In-sample R squared of the fit. */
  r_squared: number;
  /** Shrunk category offsets: category to log points. */
  offsets: Record<string, number>;
  /** How many comparables set each offset. */
  offset_counts: Record<string, number>;
}

/** One age band of the launch-odds life table. */
export interface OddsBand {
  band: string;
  n: number;
  /** Share of the band's protocols that record a token. */
  share_with_token: number;
  /** Life-table odds that a still pre-token protocol in the band ever launches. */
  odds: number;
}

/** The launch-odds model, as the dashboard reports it. */
export interface OddsModel {
  /** Token share among protocols tracked 3 years or more: the assumed eventual rate. */
  mature_rate: number;
  mature_n: number;
  /** Token share among all non-excluded protocols. */
  global_share: number;
  /** Odds for a pre-token protocol with no listing date. */
  unknown_odds: number;
  bands: OddsBand[];
  /** Category multipliers: category to multiplier, with the counts behind them. */
  category_multipliers: Record<string, number>;
  category_multiplier_counts: Record<string, number>;
}

/** The verdict cutoffs: efficiency tertiles across the pre-token board. */
export interface VerdictCutoffs {
  farm_count: number;
  thin_count: number;
  skip_count: number;
  /** Efficiency at or above this is a farm verdict. */
  farm_at_or_above: number;
  /** Efficiency at or above this is a thin verdict; below it is skip. */
  thin_at_or_above: number;
}

/** Everything the dashboard needs: the board, the live sets, and the model it runs. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  watchlist_size: number;
  board_size: number;
  pre_size: number;
  live_size: number;
  unpriced_size: number;
  excluded_size: number;
  fitted: FittedModel;
  validation: {
    leave_one_out: ValidationRun;
    walk_forward: ValidationRun;
    walk_backward: ValidationRun;
  };
  /** The P25–P75 band around any fitted value, from the leave-one-out errors. */
  bands: BandStats;
  /** Every model term, tested by leaving it out. */
  term_tests: TermTest[];
  odds: OddsModel;
  verdicts: VerdictCutoffs;
  rows: RadarRow[];
  live: LiveRow[];
  live_unpriced: UnpricedRow[];
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

/** The q-th quantile of a list of numbers, by linear interpolation. */
export function quantile(values: number[], q: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (pos - lo);
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

/** Whether a protocol records a token (a CoinGecko id or a symbol), whatever its market cap says. */
export function hasToken(p: SnapshotProtocol): boolean {
  return p.gecko_id !== null || p.symbol !== null;
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

/** Whether a protocol is one the board may rank as a launch: pre-token and not an excluded product. */
export function isRankable(p: SnapshotProtocol): boolean {
  return isPreToken(p) && !isExcludedProduct(p);
}

/** Whether a protocol is a clean live-token comparable for the fit. */
function isComparable(p: SnapshotProtocol): boolean {
  if (p.mcap_usd === null || p.mcap_usd <= 0) return false;
  if (p.tvl_usd <= 0) return false;
  if (p.category === null) return false;
  if (isExcludedProduct(p)) return false;
  return true;
}

// ------------------------------------------------------------ the fitted model

/** One regression row: the five features and the log market cap they predict. */
interface FitRow {
  p: SnapshotProtocol;
  x: number[];
  y: number;
}

/** The five features of one protocol: intercept, log TVL, clipped growth, log age, log chains. */
function features(p: SnapshotProtocol, asOf: string, model: ModelConstants): number[] {
  const age = ageDays(asOf, p.listed_at) ?? model.unknown_age_days;
  const growth = Math.min(model.growth_cap, Math.max(model.growth_floor, finite(p.change_7d, 0))) / 100;
  return [1, Math.log(p.tvl_usd), growth, Math.log(age + 30), Math.log(Math.max(1, p.chains.length))];
}

/** Solve a small linear system by Gaussian elimination with partial pivoting. */
function solveLinear(A: number[][], b: number[]): number[] {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]!]);
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r]![c]!) > Math.abs(M[piv]![c]!)) piv = r;
    const tmp = M[c]!;
    M[c] = M[piv]!;
    M[piv] = tmp;
    const d = M[c]![c]!;
    if (Math.abs(d) < 1e-12) throw new SnapshotError('regression is singular');
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = M[r]![c]! / d;
      for (let k = c; k <= n; k++) M[r]![k]! -= f * M[c]![k]!;
    }
  }
  return M.map((row, i) => row[n]! / row[i]!);
}

/** Ridge regression: least squares with a penalty on the slopes, never the intercept. */
function ridgeFit(rows: FitRow[], lambda: number): number[] {
  const k = rows[0]!.x.length;
  const XtX: number[][] = Array.from({ length: k }, () => new Array<number>(k).fill(0));
  const XtY: number[] = new Array<number>(k).fill(0);
  for (const { x, y } of rows) {
    for (let i = 0; i < k; i++) {
      XtY[i]! += x[i]! * y;
      for (let j = 0; j < k; j++) XtX[i]![j]! += x[i]! * x[j]!;
    }
  }
  for (let i = 1; i < k; i++) XtX[i]![i]! += lambda;
  return solveLinear(XtX, XtY);
}

/**
 * Shrunk category offsets: each category's mean residual, weighted n / (n + shrink),
 * for categories with at least `min_comparables` comparables. A protocol whose
 * category has no offset gets 0: the global fit speaks for it.
 */
function categoryOffsets(rows: FitRow[], beta: number[], model: ModelConstants, excludeSlug?: string): Map<string, number> {
  const sums = new Map<string, { sum: number; n: number }>();
  for (const { p, x, y } of rows) {
    if (excludeSlug !== undefined && p.slug === excludeSlug) continue;
    const pred = x.reduce((s, v, i) => s + v * beta[i]!, 0);
    const c = p.category ?? '(none)';
    const e = sums.get(c) ?? { sum: 0, n: 0 };
    e.sum += y - pred;
    e.n += 1;
    sums.set(c, e);
  }
  const out = new Map<string, number>();
  for (const [c, e] of sums) {
    if (e.n >= model.min_comparables) out.set(c, (e.sum / e.n) * (e.n / (e.n + model.offset_shrink)));
  }
  return out;
}

/** The fitted model: ridge coefficients and shrunk category offsets, from the snapshot's live tokens. */
export interface FittedFit {
  beta: number[];
  offsets: Map<string, number>;
  offsetCounts: Map<string, number>;
  comparables: number;
  rSquared: number;
}

export function fitModel(snapshot: Snapshot, model: ModelConstants = MODEL): FittedFit {
  const rows: FitRow[] = snapshot.protocols
    .filter(isComparable)
    .map((p) => ({ p, x: features(p, snapshot.as_of, model), y: Math.log(p.mcap_usd as number) }));
  if (rows.length < 10) throw new SnapshotError(`only ${rows.length} clean live comparables, need at least 10`);
  const beta = ridgeFit(rows, model.ridge_lambda);
  const offsets = categoryOffsets(rows, beta, model);
  const counts = new Map<string, number>();
  for (const { p } of rows) {
    if (offsets.has(p.category as string)) counts.set(p.category as string, (counts.get(p.category as string) ?? 0) + 1);
  }
  const yMean = rows.reduce((s, r) => s + r.y, 0) / rows.length;
  let ssTot = 0;
  let ssRes = 0;
  for (const { p, x, y } of rows) {
    const pred = x.reduce((s, v, i) => s + v * beta[i]!, 0) + (offsets.get(p.category as string) ?? 0);
    ssTot += (y - yMean) ** 2;
    ssRes += (y - pred) ** 2;
  }
  return { beta, offsets, offsetCounts: counts, comparables: rows.length, rSquared: 1 - ssRes / ssTot };
}

/** The predicted log market cap of one protocol under a fit, with the category offset. */
function predictLogMcap(p: SnapshotProtocol, asOf: string, model: ModelConstants, fit: FittedFit): number {
  const x = features(p, asOf, model);
  return x.reduce((s, v, i) => s + v * fit.beta[i]!, 0) + (fit.offsets.get(p.category as string) ?? 0);
}

/** The fitted factors and implied value of one pre-token protocol. */
export function fittedValue(
  p: SnapshotProtocol,
  asOf: string,
  model: ModelConstants,
  fit: FittedFit,
): { implied: number; factors: FittedFactors } {
  const x = features(p, asOf, model);
  const terms = x.map((v, i) => v * fit.beta[i]!);
  const offset = fit.offsets.get(p.category as string) ?? 0;
  const logMcap = terms.reduce((s, v) => s + v, 0) + offset;
  const rawRatio = Math.exp(logMcap) / p.tvl_usd;
  const ratio = Math.min(model.ratio_cap, Math.max(model.ratio_floor, rawRatio));
  const clamped = ratio !== rawRatio;
  const implied = Math.max(1, Math.round(p.tvl_usd * ratio));
  return {
    implied,
    factors: {
      log_mcap: logMcap,
      intercept: terms[0]!,
      log_tvl_term: terms[1]!,
      growth_term: terms[2]!,
      age_term: terms[3]!,
      chains_term: terms[4]!,
      category_offset: offset,
      ratio,
      clamped,
    },
  };
}

// ------------------------------------------------------------ validation

/** Error metrics of one set of held-out log errors. */
function errorMetrics(errors: number[], method: string, trainN: number, testN: number): ValidationRun {
  const abs = errors.map(Math.abs).sort((a, b) => a - b);
  const med = abs[Math.floor(abs.length / 2)]!;
  return {
    method,
    train_n: trainN,
    test_n: testN,
    median_abs_log_error: round4(med),
    median_factor: round4(Math.exp(med)),
    within_2x: round4(errors.filter((e) => Math.abs(e) < Math.log(2)).length / errors.length),
    bias: round4(errors.reduce((s, e) => s + e, 0) / errors.length),
    rmse: round4(Math.sqrt(errors.reduce((s, e) => s + e * e, 0) / errors.length)),
  };
}

/** Leave-one-out: refit on every comparable but one, predict the held-out one. */
function leaveOneOut(snapshot: Snapshot, model: ModelConstants): ValidationRun {
  const errors = looErrors(snapshot, model, null);
  const n = snapshot.protocols.filter(isComparable).length;
  return errorMetrics(errors, 'leave-one-out', n - 1, n);
}

/** One walk in time: train on one side of the cutoff, test on the other. */
function walkInTime(snapshot: Snapshot, model: ModelConstants, trainBefore: boolean): ValidationRun {
  const errors = walkErrors(snapshot, model, trainBefore, null);
  const cut = Date.parse(`${WALK_FORWARD_CUTOFF}T00:00:00Z`);
  const dated = snapshot.protocols.filter(isComparable).filter((p) => p.listed_at !== null);
  const trainN = dated.filter((p) => {
    const t = Date.parse(`${p.listed_at}T00:00:00Z`);
    return trainBefore ? t < cut : t >= cut;
  }).length;
  const testN = dated.length - trainN;
  return errorMetrics(errors, trainBefore ? 'walk-forward (train before 2025, test after)' : 'walk-backward (train after 2025, test before)', trainN, testN);
}

/** All three validation runs for one snapshot. */
export function validateModel(snapshot: Snapshot, model: ModelConstants = MODEL): {
  leave_one_out: ValidationRun;
  walk_forward: ValidationRun;
  walk_backward: ValidationRun;
} {
  return {
    leave_one_out: leaveOneOut(snapshot, model),
    walk_forward: walkInTime(snapshot, model, true),
    walk_backward: walkInTime(snapshot, model, false),
  };
}

// ------------------------------------------------------------ term tests and bands

/**
 * One ablation: which feature columns a test fit keeps, and whether it uses
 * category offsets. The full model keeps all five columns with offsets.
 */
interface AblationSpec {
  label: string;
  /** Indices into the five features [1, log TVL, growth, log age, log chains]. */
  keep: number[];
  offsets: boolean;
}

const FULL_SPEC: AblationSpec = { label: 'full model', keep: [0, 1, 2, 3, 4], offsets: true };

/** A feature vector with only the spec's columns kept. */
function subX(x: number[], keep: number[]): number[] {
  return keep.map((i) => x[i]!);
}

/** Ridge fit + shrunk offsets under one ablation spec. */
function fitSpec(rows: FitRow[], spec: AblationSpec, lambda: number, model: ModelConstants): { beta: number[]; offsets: Map<string, number> } {
  const mapped = rows.map((r) => ({ p: r.p, x: subX(r.x, spec.keep), y: r.y }));
  const beta = ridgeFit(mapped, lambda);
  const offsets = spec.offsets ? categoryOffsets(mapped, beta, model) : new Map<string, number>();
  return { beta, offsets };
}

/** A held-out prediction under one ablation spec. */
function predictSpec(row: FitRow, spec: AblationSpec, fit: { beta: number[]; offsets: Map<string, number> }): number {
  const x = subX(row.x, spec.keep);
  return x.reduce((s, v, i) => s + v * fit.beta[i]!, 0) + (spec.offsets ? (fit.offsets.get(row.p.category as string) ?? 0) : 0);
}

/** The comparables as regression rows. */
function comparableRows(snapshot: Snapshot, model: ModelConstants): FitRow[] {
  return snapshot.protocols
    .filter(isComparable)
    .map((p) => ({ p, x: features(p, snapshot.as_of, model), y: Math.log(p.mcap_usd as number) }));
}

/** Leave-one-out log errors (predicted minus actual) under one ablation spec. */
function looErrors(snapshot: Snapshot, model: ModelConstants, spec: AblationSpec | null): number[] {
  const rows = comparableRows(snapshot, model);
  const use = spec ?? FULL_SPEC;
  const errors: number[] = [];
  for (const held of rows) {
    const others = rows.filter((r) => r.p.slug !== held.p.slug);
    const fit = fitSpec(others, use, model.ridge_lambda, model);
    errors.push(predictSpec(held, use, fit) - held.y);
  }
  return errors;
}

/** Walk-in-time log errors (predicted minus actual) under one ablation spec. */
function walkErrors(snapshot: Snapshot, model: ModelConstants, trainBefore: boolean, spec: AblationSpec | null): number[] {
  const cut = Date.parse(`${WALK_FORWARD_CUTOFF}T00:00:00Z`);
  const rows = comparableRows(snapshot, model).filter((r) => r.p.listed_at !== null);
  const use = spec ?? FULL_SPEC;
  const isTrain = (p: SnapshotProtocol): boolean => {
    const t = Date.parse(`${p.listed_at}T00:00:00Z`);
    return trainBefore ? t < cut : t >= cut;
  };
  const train = rows.filter((r) => isTrain(r.p));
  const test = rows.filter((r) => !isTrain(r.p));
  const fit = fitSpec(train, use, model.ridge_lambda, model);
  return test.map((r) => predictSpec(r, use, fit) - r.y);
}

/**
 * The median multiplicative error of one set of log errors. Uses the same
 * upper-middle pick as errorMetrics, so the ablation's full-model numbers
 * match the validation runs exactly.
 */
function medianFactor(errors: number[]): number {
  const abs = errors.map(Math.abs).sort((a, b) => a - b);
  return Math.exp(abs[Math.floor(abs.length / 2)]!);
}

/** The P25–P75 band around a fitted value, from the leave-one-out log errors. */
export function bandFactors(snapshot: Snapshot, model: ModelConstants = MODEL): BandStats {
  // Errors are predicted minus actual; flip them so the band sits on actual minus predicted.
  const e = looErrors(snapshot, model, null).map((v) => -v);
  const q25 = quantile(e, 0.25);
  const q75 = quantile(e, 0.75);
  const holds = e.filter((v) => v >= q25 && v <= q75).length / e.length;
  return {
    loo_q25_log: round4(q25),
    loo_q75_log: round4(q75),
    lo_factor: round4(Math.exp(q25)),
    hi_factor: round4(Math.exp(q75)),
    range_holds: round4(holds),
  };
}

/**
 * Every model term, tested by leaving it out: the held-out median error with
 * the term dropped, on both the leave-one-out and the walk-forward test. A
 * term stays when dropping it makes at least one test worse; dropping it
 * improves BOTH tests by more than 2% only when the term is pure noise.
 */
export function termAblation(snapshot: Snapshot, model: ModelConstants = MODEL): TermTest[] {
  const fullLoo = medianFactor(looErrors(snapshot, model, null));
  const fullWf = medianFactor(walkErrors(snapshot, model, true, null));
  const specs: AblationSpec[] = [
    { label: 'log TVL', keep: [0, 2, 3, 4], offsets: true },
    { label: '7-day growth', keep: [0, 1, 3, 4], offsets: true },
    { label: 'log age', keep: [0, 1, 2, 4], offsets: true },
    { label: 'log chains', keep: [0, 1, 2, 3], offsets: true },
    { label: 'category offsets', keep: [0, 1, 2, 3, 4], offsets: false },
  ];
  return specs.map((spec) => {
    const loo = medianFactor(looErrors(snapshot, model, spec));
    const wf = medianFactor(walkErrors(snapshot, model, true, spec));
    const dropImprovesBoth = loo < fullLoo * 0.98 && wf < fullWf * 0.98;
    const kept = !dropImprovesBoth;
    const note = dropImprovesBoth
      ? 'Dropping it improves both held-out tests — the term is noise and should be removed.'
      : loo >= fullLoo && wf >= fullWf
        ? 'Dropping it makes both held-out tests worse — the term earns its place.'
        : 'Mixed evidence across the two tests; the term stays on its small effect.';
    return {
      term: spec.label,
      loo_factor: round4(loo),
      walk_forward_factor: round4(wf),
      kept,
      note,
    };
  });
}

// ------------------------------------------------------------ launch odds

/** The launch-odds model: a life table by age band, adjusted by category. */
export interface OddsFit {
  matureRate: number;
  matureN: number;
  globalShare: number;
  unknownOdds: number;
  bands: OddsBand[];
  categoryMultipliers: Map<string, number>;
  categoryMultiplierCounts: Map<string, number>;
}

export function fitOdds(snapshot: Snapshot, model: ModelConstants = MODEL): OddsFit {
  const kept = snapshot.protocols.filter((p) => !isExcludedProduct(p));
  const mature = kept.filter((p) => {
    const a = ageDays(snapshot.as_of, p.listed_at);
    return a !== null && a >= 1095;
  });
  const matureRate = mature.filter(hasToken).length / mature.length;
  const globalShare = kept.filter(hasToken).length / kept.length;
  const clipOdds = (v: number): number => Math.min(model.odds_cap, Math.max(model.odds_floor, v));
  const bandDefs: Array<[string, (a: number | null) => boolean]> = [
    ['under 6 months', (a) => a !== null && a < 180],
    ['6–12 months', (a) => a !== null && a >= 180 && a < 365],
    ['1–2 years', (a) => a !== null && a >= 365 && a < 730],
    ['2–3 years', (a) => a !== null && a >= 730 && a < 1095],
    ['3 years or more', (a) => a !== null && a >= 1095],
  ];
  const bands: OddsBand[] = bandDefs.map(([band, f]) => {
    const set = kept.filter((p) => f(ageDays(snapshot.as_of, p.listed_at)));
    const share = set.filter(hasToken).length / set.length;
    return { band, n: set.length, share_with_token: round4(share), odds: round4(clipOdds((matureRate - share) / (1 - share))) };
  });
  const unknownOdds = round4(clipOdds((matureRate - globalShare) / (1 - globalShare)));
  // Category multipliers from mature protocols only (tracked at least a year),
  // so the category effect is not just the age of the category's protocols.
  const mature1y = kept.filter((p) => {
    const a = ageDays(snapshot.as_of, p.listed_at);
    return a !== null && a >= 365;
  });
  const matureShare = mature1y.filter(hasToken).length / mature1y.length;
  const byCat = new Map<string, { n: number; tok: number }>();
  for (const p of mature1y) {
    const c = p.category ?? '(none)';
    const e = byCat.get(c) ?? { n: 0, tok: 0 };
    e.n += 1;
    if (hasToken(p)) e.tok += 1;
    byCat.set(c, e);
  }
  const categoryMultipliers = new Map<string, number>();
  const categoryMultiplierCounts = new Map<string, number>();
  for (const [c, e] of byCat) {
    if (e.n < model.mature_min_n) continue;
    const mult = Math.min(model.category_mult_cap, Math.max(model.category_mult_floor, e.tok / e.n / matureShare));
    categoryMultipliers.set(c, round4(mult));
    categoryMultiplierCounts.set(c, e.n);
  }
  return { matureRate: round4(matureRate), matureN: mature.length, globalShare: round4(globalShare), unknownOdds, bands, categoryMultipliers, categoryMultiplierCounts };
}

/** The launch odds of one pre-token protocol: its age band's life-table odds, adjusted for its category. */
export function launchOdds(p: SnapshotProtocol, asOf: string, model: ModelConstants, odds: OddsFit): number {
  const age = ageDays(asOf, p.listed_at);
  let base: number;
  if (age === null) base = odds.unknownOdds;
  else if (age < 180) base = odds.bands[0]!.odds;
  else if (age < 365) base = odds.bands[1]!.odds;
  else if (age < 730) base = odds.bands[2]!.odds;
  else if (age < 1095) base = odds.bands[3]!.odds;
  else base = odds.bands[4]!.odds;
  const mult = odds.categoryMultipliers.get(p.category as string) ?? 1;
  const raw = Math.min(model.odds_cap, Math.max(model.odds_floor, base * mult));
  return Math.round(raw * 1e4) / 1e4;
}

// ------------------------------------------------------------ farm plans

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

/** Total gas across a farm plan, in whole dollars: five actions at the chain's mid-range price. */
export function gasTotalFor(p: SnapshotProtocol, model: ModelConstants = MODEL): number {
  const expensive = p.chains.some((c) => c === 'Ethereum' || c === 'Bitcoin');
  return expensive ? model.gas_expensive : model.gas_cheap;
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

// ------------------------------------------------------------ the board

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/** The mixed board: every rankable pre-token launch plus every live token with a market cap. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const fit = fitModel(snapshot, model);
  const odds = fitOdds(snapshot, model);
  const index = bySlug(snapshot.protocols);

  interface Scored {
    p: SnapshotProtocol;
    pre: boolean;
    implied: number;
    factors: FittedFactors | null;
    odds: number | null;
    age: number | null;
  }
  const scored: Scored[] = [];
  // The watchlist is the floor: every slug, even one the snapshot no longer carries.
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined && isRankable(p)) {
      const age = ageDays(snapshot.as_of, p.listed_at);
      const v = fittedValue(p, snapshot.as_of, model, fit);
      scored.push({ p, pre: true, implied: v.implied, factors: v.factors, odds: launchOdds(p, snapshot.as_of, model, odds), age });
    }
  }
  // Every other rankable pre-token protocol, at any TVL the snapshot carries.
  for (const p of snapshot.protocols) {
    if (!scored.some((s) => s.p.slug === p.slug) && isRankable(p)) {
      const age = ageDays(snapshot.as_of, p.listed_at);
      const v = fittedValue(p, snapshot.as_of, model, fit);
      scored.push({ p, pre: true, implied: v.implied, factors: v.factors, odds: launchOdds(p, snapshot.as_of, model, odds), age });
    }
  }
  // Every live token with a market cap on record, at the market's own value.
  // The fitted factors are still computed, so the detail view can show what
  // the model would have priced the token at against the market's answer.
  for (const p of snapshot.protocols) {
    if (p.mcap_usd !== null && p.mcap_usd > 0 && !isExcludedProduct(p)) {
      const v = fittedValue(p, snapshot.as_of, model, fit);
      scored.push({ p, pre: false, implied: Math.round(p.mcap_usd), factors: v.factors, odds: null, age: ageDays(snapshot.as_of, p.listed_at) });
    }
  }
  scored.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));

  // Farm verdicts: expected launch value per dollar the farm costs, in tertiles.
  const pre = scored.filter((s) => s.pre);
  const efficiencies = pre.map((s) => {
    const cost = capitalFor(s.p) + gasTotalFor(s.p, model);
    return { slug: s.p.slug, eff: (s.implied * (s.odds ?? 0)) / cost };
  });
  const sortedEff = efficiencies.map((e) => e.eff).sort((a, b) => a - b);
  const cutLow = sortedEff[Math.floor(sortedEff.length / 3)]!;
  const cutHigh = sortedEff[Math.floor((2 * sortedEff.length) / 3)]!;
  const verdictOf = (slug: string): Verdict => {
    const eff = efficiencies.find((e) => e.slug === slug)!.eff;
    if (eff >= cutHigh) return 'farm';
    if (eff >= cutLow) return 'thin';
    return 'skip';
  };

  // The P25–P75 band around every fitted value, from the leave-one-out errors.
  const bands = bandFactors(snapshot, model);

  return scored.map((s, i) => {
    const verdict = s.pre ? verdictOf(s.p.slug) : null;
    return {
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
      token_status: s.pre ? 'pre-token' : 'live',
      age_days: s.age,
      implied_value_usd: s.implied,
      p25_usd: s.pre ? Math.max(1, Math.round(s.implied * bands.lo_factor)) : null,
      p75_usd: s.pre ? Math.max(1, Math.round(s.implied * bands.hi_factor)) : null,
      launch_odds: s.odds,
      verdict,
      expected_value_usd: s.pre ? Math.round(s.implied * (s.odds ?? 0)) : null,
      model: s.factors === null ? null : {
        log_mcap: round4(s.factors.log_mcap),
        intercept: round4(s.factors.intercept),
        log_tvl_term: round4(s.factors.log_tvl_term),
        growth_term: round4(s.factors.growth_term),
        age_term: round4(s.factors.age_term),
        chains_term: round4(s.factors.chains_term),
        category_offset: round4(s.factors.category_offset),
        ratio: round4(s.factors.ratio),
        clamped: s.factors.clamped,
      },
      farm_steps: farmSteps(s.p, s.age).map(stepText),
    };
  });
}

/** The live-token protocols, by market cap, for the Live token view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  const board = buildBoard(snapshot);
  return board
    .filter((r) => r.token_status === 'live')
    .map((r) => ({
      rank: r.rank,
      slug: r.slug,
      name: r.name,
      category: r.category,
      chains: r.chains,
      tvl_usd: r.tvl_usd,
      mcap_usd: r.mcap_usd as number,
      change_7d: r.change_7d,
      listed_at: r.listed_at,
      age_days: r.age_days,
      fitted_value_usd: r.model === null ? 1 : Math.max(1, Math.round(r.tvl_usd * r.model.ratio)),
    }));
}

/** Protocols that record a token but no market cap: listed in the Live view, never ranked. */
export function liveUnpricedRows(snapshot: Snapshot): UnpricedRow[] {
  return snapshot.protocols
    .filter((p) => hasToken(p) && (p.mcap_usd === null || p.mcap_usd <= 0) && !isExcludedProduct(p))
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : 1))
    .map((p) => ({ slug: p.slug, name: p.name, category: p.category, chains: p.chains, tvl_usd: p.tvl_usd }));
}

/** The board, the live sets, and the model behind them, ready for the dashboard. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): RadarData {
  const fit = fitModel(snapshot, model);
  const validation = validateModel(snapshot, model);
  const odds = fitOdds(snapshot, model);
  const board = buildBoard(snapshot, model);
  const live: LiveRow[] = board
    .filter((r) => r.token_status === 'live')
    .map((r) => ({
      rank: r.rank,
      slug: r.slug,
      name: r.name,
      category: r.category,
      chains: r.chains,
      tvl_usd: r.tvl_usd,
      mcap_usd: r.mcap_usd as number,
      change_7d: r.change_7d,
      listed_at: r.listed_at,
      age_days: r.age_days,
      fitted_value_usd: r.model === null ? 1 : Math.max(1, Math.round(r.tvl_usd * r.model.ratio)),
    }));
  const unpriced = liveUnpricedRows(snapshot);
  const index = bySlug(snapshot.protocols);
  const preRows = board.filter((r) => r.token_status === 'pre-token');
  const efficiencies = preRows.map((r) => {
    const p = index.get(r.slug)!;
    return (r.implied_value_usd * (r.launch_odds ?? 0)) / (capitalFor(p) + gasTotalFor(p, model));
  });
  const sortedEff = [...efficiencies].sort((a, b) => a - b);
  const cutLow = sortedEff[Math.floor(sortedEff.length / 3)]!;
  const cutHigh = sortedEff[Math.floor((2 * sortedEff.length) / 3)]!;
  const rows: RadarRow[] = preRows.map((r, i) => {
    const p = index.get(r.slug)!;
    const v = fittedValue(p, snapshot.as_of, model, fit);
    return {
      rank: r.rank,
      launch_rank: i + 1,
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
      p25_usd: r.p25_usd as number,
      p75_usd: r.p75_usd as number,
      launch_odds: r.launch_odds as number,
      verdict: r.verdict as Verdict,
      expected_value_usd: r.expected_value_usd as number,
      fitted: v.factors,
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
    pre_size: preRows.length,
    live_size: live.length,
    unpriced_size: unpriced.length,
    excluded_size: snapshot.protocols.filter(isExcludedProduct).length,
    fitted: {
      coefficients: fit.beta.map((v) => round4(v)),
      comparables: fit.comparables,
      r_squared: round4(fit.rSquared),
      offsets: Object.fromEntries([...fit.offsets.entries()].map(([c, v]) => [c, round4(v)])),
      offset_counts: Object.fromEntries(fit.offsetCounts.entries()),
    },
    validation,
    bands: bandFactors(snapshot, model),
    term_tests: termAblation(snapshot, model),
    odds: {
      mature_rate: odds.matureRate,
      mature_n: odds.matureN,
      global_share: odds.globalShare,
      unknown_odds: odds.unknownOdds,
      bands: odds.bands,
      category_multipliers: Object.fromEntries(odds.categoryMultipliers.entries()),
      category_multiplier_counts: Object.fromEntries(odds.categoryMultiplierCounts.entries()),
    },
    verdicts: {
      farm_count: preRows.filter((r) => r.verdict === 'farm').length,
      thin_count: preRows.filter((r) => r.verdict === 'thin').length,
      skip_count: preRows.filter((r) => r.verdict === 'skip').length,
      farm_at_or_above: round4(cutHigh),
      thin_at_or_above: round4(cutLow),
    },
    rows,
    live,
    live_unpriced: unpriced,
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
  if (slugs.size !== board.length) return 'board has a duplicate slug';
  for (const slug of snapshot.watchlist) {
    if (!slugs.has(slug)) return `board is missing watchlist slug ${slug}`;
  }
  for (let i = 0; i < board.length; i++) {
    const row = board[i]!;
    if (row.rank !== i + 1) return `row ${row.slug} has rank ${row.rank}, expected ${i + 1}`;
    if (!Number.isSafeInteger(row.implied_value_usd) || row.implied_value_usd <= 0) return `row ${row.slug} has an implied value that is not a positive integer`;
    if (row.implied_value_usd > 1e14) return `row ${row.slug} has an implied value above 1e14`;
    if (i > 0 && row.implied_value_usd > board[i - 1]!.implied_value_usd) return `board is not sorted by implied value at row ${row.slug}`;
    if (row.token_status === 'live' && row.mcap_usd !== row.implied_value_usd) return `live row ${row.slug} has an implied value that is not its market cap`;
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
