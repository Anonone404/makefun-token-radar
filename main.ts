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
  console.log(`Token Radar wrote ${board.length} rows (${watched} watchlist, ${board.length - watched} early) to ${resolve(out)}`);
  console.log(`Top row: ${board[0]!.name} at $${board[0]!.implied_value_usd.toLocaleString('en-US')}`);
}

main(process.argv);
