# Token Radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/Anonone404/makefun-token-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/Anonone404/makefun-token-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Token Radar ranks the DeFi protocols that have no token yet by what their launch would be worth, and turns each one into a concrete plan to farm it. It reads one sealed snapshot of the protocol universe — every protocol DefiLlama tracked on 2026-11-14 — and writes a static dashboard: the ranked board, a detail view for every protocol with the full equation behind its rank, and an eight-step farm plan with a cost and a time on every step. No network, no live data, no install.

## What the radar found

The board ranks **290 protocols: 198 pre-token launches plus 92 live tokens at their market caps**, with a combined implied launch value of **$1.98 billion** across the pre-token set. Value is far less concentrated than a median rule suggests: the top 10 hold only **15%** of it, and the median launch is worth **$8.0M**.

| Launch rank | Protocol | Implied launch value | Launch odds | Verdict |
| --- | --- | --- | --- | --- |
| 1 | Sentora Curator | $40,719,797 | 23% | Skip |
| 2 | Steakhouse Financial | $34,024,073 | 23% | Skip |
| 3 | Bittensor dTAO | $31,274,126 | 91% | Farm |
| 4 | Nonce Capital | $30,702,294 | 25% | Thin |
| 5 | Axis | $29,286,262 | 93% | Farm |

Three patterns run through the board:

- **The biggest launches are the worst farms.** Sentora Curator and Steakhouse Financial hold the two largest TVLs on the board ($2.76B and $2.75B), but both are Risk Curators — a category whose mature protocols almost never launch (multiplier 0.30) — so both carry 23% launch odds and a Skip verdict. The best farms are smaller and younger: Bittensor dTAO (56 days old, $376M TVL) and Axis (86 days, $70M TVL) both clear 90% odds.
- **The fitted model prices launches far below a median rule.** The old median-multiple model put this same board at $4.12B; the fitted model says $1.98B. The median fitted multiple is 0.33× TVL, and the biggest protocols are worth far less per TVL dollar than the small ones — value grows slower than TVL.
- **This is not a momentum board.** The median protocol shrank 3.8% over the last 7 days, and 113 of the 198 run on a single chain. The ranking is driven by size and reach, not by a hot week — and the fit barely rewards growth at all, because a TVL spike reads as inflows, not value. The detail view shows, for every protocol, exactly which factor puts it where it is.

For comparison, the dashboard carries 92 live-token protocols at their market caps. The largest, Rain at $2.65B, is worth 65 times the top pre-token launch — and the model would have priced Rain itself at only $5.9M, 451× below the market. That gap is the point of the model check in the detail view: the fit is honest about how far it can miss, and the validation strip reports the held-out error next to the board.

## How the ranking works

A protocol is ranked when the snapshot **records no token** for it — no market cap, no CoinGecko id, no symbol — and it is not a wrapped, staked, bridged or exchange product of a token that already trades. That wording is deliberate: the snapshot is a record, not proof, so the board says a protocol records no token, never that it has none. Live-token protocols join the same board at their market caps for comparison; a further 152 record a token but no market cap and are listed unranked, and 316 products are excluded as wrappers or exchange products.

Each pre-token protocol gets an implied launch value from a regression fitted on the snapshot's own live tokens — never a hardcoded list of names:

```
log mcap = 10.57 + 0.36 × log TVL − 0.10 × growth − 0.12 × log age − 0.15 × log chains + category offset
```

- **Fitted, not assumed** — a ridge regression (λ = 10, chosen by leave-one-out among 0, 1 and 10) on 92 live tokens, in the log of market cap. Value grows slower than TVL (doubling TVL adds 28%, not 100%), older protocols are cheaper per TVL dollar, and the growth term is shrunk hard: the raw fit's −1.9 is noise, so the ridge keeps only −0.10.
- **Category offsets** — shrunk mean residuals for categories with at least 3 live tokens: Lending −0.72, Basis Trading +0.64, Privacy +0.56, Cross Chain Bridge +0.39, RWA +0.21, Dexs +0.05, Indexes −0.02, CDP −0.37, Yield −0.46, Yield Aggregator −0.44. A safety clamp keeps every implied value between 0.005× and 2× TVL; it binds on no row.
- **Launch odds** — a life table over the snapshot's own record. Of the protocols tracked 3 years or more, 86% record a token; that is the assumed eventual rate. Still pre-token protocols carry 81% (under 6 months), 78% (6–12 months), 77% (1–2 years) or 63% (2–3 years) of that rate, times a category multiplier from mature protocols (Risk Curators 0.30, Lending 1.27, the rest near 1), floored at 5% and capped at 95%.
- **Verdict** — farm, thin or skip from expected value per dollar: implied value × launch odds, divided by the farm's cost (capital $50–$250 by TVL tier plus gas $25, or $80 on expensive chains). The board splits into exact thirds: 66 farm, 66 thin, 66 skip.

The same function scores every row; no protocol is special-cased. The dashboard recomputes each protocol's value from its factors in the detail view and says whether it matches the board.

## How the model was tested

The dashboard shows the held-out scores next to the board, with the actual numbers:

| Test | Median error | Within 2× | Bias |
| --- | --- | --- | --- |
| Leave-one-out (92 tokens) | 3.32× | 35% | −0.08 |
| Walk-forward, train before 2025, test 2025 (29 tokens) | 3.00× | 31% | −1.22 |
| Walk-backward, train 2025, test before (41 tokens) | 3.00× | 32% | +1.11 |

Launch values are hard to predict, and the numbers say so: the median held-out error is about 3×. Walk-forward matters most — the fit trained on pre-2025 launches underpredicts 2025 launches, so the board's implied values are probably low for the youngest protocols. Launch odds are base rates from the peers' record, not forecasts: if the current regime persists, they overstate young protocols.

Every fitted value also carries a P25–P75 band, from the leave-one-out log errors: ×0.33 to ×3.94 of the fitted value, and half of the held-out tokens land inside their own band. Every model term is tested by leaving it out and refitting from scratch — dropping log TVL makes both held-out tests worse, dropping any other term is mixed, so every term stays. The dashboard shows the band on every row and the term tests in the validation section.

## Run it

```sh
node main.ts
```

Node 22.18 or later, standard library only, no install. By default `main.ts` reads the sealed snapshot (`/input/snapshot.json`) and writes to `/output`:

- `board.json` — the 290 ranked rows with their factors and farm plans
- `data.js` — the same data for the dashboard
- `dashboard/` — the static page (open `dashboard/index.html` in a browser)
- `screenshots/` — the three screenshots of the board, a detail view, and a filtered view
- `dossier.json` — the entry dossier for the make.fun grader

The run is pure: the same snapshot always writes the same bytes. It reads no network and writes no clock into any output.

## Layout

```
main.ts                  entry point: snapshot in, board + dashboard + dossier out
lib/model.ts             the ranking model (radar-3) and the farm-plan generator
dashboard/index.html     the board page
dashboard/app.js         renders the board, filters, and the detail view locally
dashboard/app.css        the page's styling, no external assets
vendor/makefun-board.ts  the kit's dossier builder, unchanged
screenshots/              board, detail, and filtered views of the dashboard
```

## Limits

The snapshot is sealed at 2026-11-14, so the board is a picture of that day, not of today. The model knows TVL, growth, age, and chain breadth; it knows nothing about points programs, teams, audits, or whether an airdrop will ever happen, and it cannot tell a protocol that will launch from one that never will. The farm plans are generic steps sized to each protocol's category and chain — they are a starting point, not financial advice, and every step that touches a wallet is the reader's own decision.

---

Entered on [make.fun](https://make.fun/?ref=em5379j4&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards
