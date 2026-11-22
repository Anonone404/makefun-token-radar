# makefun-token-radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/Anonone404/makefun-token-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/Anonone404/makefun-token-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Token Radar ranks pre-token DeFi protocols by implied launch value, from a sealed DefiLlama snapshot. Every number follows from the snapshot itself: TVL times a category multiple (the median market-cap/TVL of live tokens in the same category), adjusted for 7-day growth, age, and chain breadth. The board covers the whole 40-protocol watchlist plus every other pre-token protocol the same rule keeps, each with an eight-step farm plan. A static dashboard, no network.

## Run it

```sh
node main.ts
```

`main.ts` reads the sealed snapshot (`/input/snapshot.json` by default) and writes `board.json`, `data.js`, a copy of `dashboard/` and `screenshots/`, and `dossier.json` to the output directory (`/output` by default). Node 22.18 or later, standard library only, no install.

---

Entered on [make.fun](https://make.fun/?ref=em5379j4&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards
