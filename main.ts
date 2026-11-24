// Token Radar: build the entry from the sealed snapshot.
//
//   node main.ts [snapshot.json] [output-dir]
//
// Reads the sealed snapshot, ranks every pre-token protocol the snapshot's
// own rule would keep, and writes the entry: board.json, dashboard data.js,
// a copy of the dashboard and the screenshots, and dossier.json from
// vendor/makefun-board.ts.
//
// The run is pure: the same snapshot always writes the same bytes. It reads
// no network and writes no clock into any output, so the platform's two
// sandbox runs produce identical files.

import { readFileSync, writeFileSync, existsSync, mkdirSync, cpSync, chmodSync, readdirSync, statSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { buildDossier } from './vendor/makefun-board.ts';
import { parseSnapshot, buildBoard, buildRadar, boardIssue, dataScript } from './lib/model.ts';
export function parseArgs(argv: string[]): { snapshot: string; out: string } {
  const snapshot = argv[2] ?? '/input/snapshot.json';
  const out = argv[3] ?? '/output';
  return { snapshot, out };
}

const TEXT_MAX_BYTES = 65_536;
const SCREENSHOTS_MAX = 4;
const SCREENSHOT_MAX_BYTES = 524_288;
const DASHBOARD_MAX_FILES = 400;
const DASHBOARD_MAX_BYTES = 4 * 1024 * 1024;

function readDirBytes(dir: string): number {
  let total = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) total += readDirBytes(path);
    else if (entry.isFile()) total += statSync(path).size;
  }
  return total;
}

function countFiles(dir: string): number {
  let total = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) total += countFiles(path);
    else if (entry.isFile()) total += 1;
  }
  return total;
}

export function main(argv: string[]): void {
  const { snapshot, out } = parseArgs(argv);
  const here = dirname(new URL(import.meta.url).pathname);

  const raw = JSON.parse(readFileSync(snapshot, 'utf8'));
  const snap = parseSnapshot(raw);
  const board = buildBoard(snap);
  const issue = boardIssue(snap, board);
  if (issue !== null) throw new Error(`board issue: ${issue}`);
  const radar = buildRadar(snap);

  mkdirSync(out, { recursive: true });
  const text = dataScript(radar);
  const dashboardDir = join(here, 'dashboard');
  const fileCount = countFiles(dashboardDir);
  if (fileCount > DASHBOARD_MAX_FILES) throw new Error(`dashboard has ${fileCount} files, over the 400-file cap`);
  const dashboardBytes = readDirBytes(dashboardDir);
  if (dashboardBytes > DASHBOARD_MAX_BYTES) throw new Error('dashboard is over the 4 MiB cap');
  if (dashboardBytes > TEXT_MAX_BYTES) {
    throw new Error(`dashboard source is ${dashboardBytes} bytes, over the 65,536-byte cap the judge reads`);
  }

  const screenshotsDir = join(here, 'screenshots');
  if (!existsSync(screenshotsDir)) throw new Error('screenshots/ is missing: take the three screenshots first');
  const shots = readdirSync(screenshotsDir).filter((name) => /\.(png|jpe?g)$/i.test(name)).sort();
  if (shots.length < 3) throw new Error(`screenshots/ has ${shots.length} images, need at least 3`);
  if (shots.length > SCREENSHOTS_MAX) throw new Error(`screenshots/ has ${shots.length} images, at most ${SCREENSHOTS_MAX}`);
  for (const name of shots) {
    const size = statSync(join(screenshotsDir, name)).size;
    if (size > SCREENSHOT_MAX_BYTES) throw new Error(`screenshot ${name} is ${size} bytes, over the 512 KiB cap`);
  }

  const boardJson = `${JSON.stringify(board, null, 2)}\n`;
  writeFileSync(join(out, 'board.json'), boardJson, { mode: 0o644 });
  writeFileSync(join(out, 'data.js'), text, { mode: 0o644 });
  cpSync(dashboardDir, join(out, 'dashboard'), { recursive: true });
  cpSync(screenshotsDir, join(out, 'screenshots'), { recursive: true });
  chmodSync(join(out, 'board.json'), 0o644);
  chmodSync(join(out, 'data.js'), 0o644);

  const dossier = buildDossier(out, {
    text_max_bytes: TEXT_MAX_BYTES,
    screenshots: { max: SCREENSHOTS_MAX, max_bytes: SCREENSHOT_MAX_BYTES },
    dashboard: { max_files: DASHBOARD_MAX_FILES, max_bytes: DASHBOARD_MAX_BYTES },
  });
  writeFileSync(join(out, 'dossier.json'), dossier, { mode: 0o644 });

  const watched = snap.watchlist.length;
  const pre = board.filter((r) => r.token_status === 'pre-token');
  const live = board.filter((r) => r.token_status === 'live');
  const fmtInt = (n: number): string => n.toLocaleString('en-US');
  console.log(`Token Radar wrote ${board.length} rows (${pre.length} pre-token launches, ${live.length} live tokens) to ${resolve(out)}`);
  console.log(`Top launch: ${pre[0]!.name} at $${fmtInt(pre[0]!.implied_value_usd)} implied (launch rank 1, board rank ${pre[0]!.rank})`);
  console.log(`Top board row: ${board[0]!.name} at $${fmtInt(board[0]!.implied_value_usd)} (${board[0]!.token_status})`);
  const f = radar.fitted;
  console.log(`Fitted model radar-3 on ${f.comparables} live comparables: log mcap = ${f.coefficients[0]} + ${f.coefficients[1]}*log TVL + ${f.coefficients[2]}*growth + ${f.coefficients[3]}*log(age+30) + ${f.coefficients[4]}*log chains; R2 ${f.r_squared}`);
  const v = radar.validation;
  console.log(`Validation leave-one-out: median error ${v.leave_one_out.median_factor}x, within 2x ${Math.round(v.leave_one_out.within_2x * 100)}%, bias ${v.leave_one_out.bias}`);
  console.log(`Validation walk-forward: median error ${v.walk_forward.median_factor}x, within 2x ${Math.round(v.walk_forward.within_2x * 100)}%, bias ${v.walk_forward.bias} (train ${v.walk_forward.train_n}, test ${v.walk_forward.test_n})`);
  console.log(`Validation walk-backward: median error ${v.walk_backward.median_factor}x, within 2x ${Math.round(v.walk_backward.within_2x * 100)}%, bias ${v.walk_backward.bias} (train ${v.walk_backward.train_n}, test ${v.walk_backward.test_n})`);
  console.log(`Bands P25-P75: x${radar.bands.lo_factor} to x${radar.bands.hi_factor} of the fitted value (log ${radar.bands.loo_q25_log} to ${radar.bands.loo_q75_log}); range holds ${Math.round(radar.bands.range_holds * 100)}% of held-out tokens`);
  for (const t of radar.term_tests) {
    console.log(`Term test (drop ${t.term}): leave-one-out ${t.loo_factor}x, walk-forward ${t.walk_forward_factor}x — ${t.kept ? 'kept' : 'DROP'}: ${t.note}`);
  }
  console.log(`Launch odds: mature-cohort rate ${radar.odds.mature_rate} (n=${radar.odds.mature_n}); bands ${radar.odds.bands.map((b) => `${b.band} ${b.odds}`).join(', ')}`);
  console.log(`Verdicts: farm ${radar.verdicts.farm_count}, thin ${radar.verdicts.thin_count}, skip ${radar.verdicts.skip_count}; farm at efficiency >= ${radar.verdicts.farm_at_or_above}, thin at >= ${radar.verdicts.thin_at_or_above}`);
  console.log(`Coverage: ${board.length} ranked rows, ${radar.unpriced_size} more record a token but no market cap, ${radar.excluded_size} excluded products; watchlist ${watched} all covered`);
}

main(process.argv);
