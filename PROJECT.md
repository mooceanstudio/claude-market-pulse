# Market Pulse — project guide

Live cryptocurrency dashboard. **Zero runtime dependencies, no build step**:
plain ES modules + hand-rolled SVG charts, deployed to GitHub Pages as-is.
Keep it that way — do not introduce npm packages, bundlers, or frameworks.

## Run & verify

```bash
python3 -m http.server 8080        # serve locally, then open :8080
node scripts/fetch-snapshot.mjs    # refresh the fallback snapshot
```

There is no test suite; verification is loading the page. A change isn't done
until it's checked in **both themes** and with the network offline (the page
must fall back to `data/snapshot.json` and say so).

## Architecture

```
index.html            static shell; one card per widget
css/style.css         ALL design tokens (light + dark) as CSS custom props
js/config.js          endpoints, refresh cadence, palette slot access
js/api.js             fetchData(): live CoinGecko + Fear & Greed → snapshot fallback
js/charts.js          SVG renderers: line+crosshair, bars, sparkline, tooltip
js/table.js           sortable market table
js/app.js             state, 60s refresh loop, theme, renderAll()
scripts/fetch-snapshot.mjs   Node script the hourly Action runs
data/snapshot.json    committed fallback data (bot-updated hourly)
.github/workflows/    update-data.yml (hourly cron) · deploy-pages.yml
```

Data flows one way: `fetchData() → state.data → renderAll()`. New widgets
plug into `renderAll()`; nothing renders outside that path.

## Design system

Tokens follow a validated palette (colorblind-safe categorical order,
per-mode steps). Rules that must survive any edit:

- Series colors only via `seriesColor(i)` — fixed slot per entity, never
  cycled, never re-assigned when a filter changes the series count.
- One y-axis per chart. Two scales → index to a common base (`renderPerf()`).
- Text uses `--text-*` tokens, never a series color.
- Dark mode is its own palette in `css/style.css`, not a CSS filter; the
  theme toggle re-renders charts because SVG attrs resolve colors at render.
- Marks: 2px lines, bars ≤24px with 4px rounded data-end, hairline grid.
- Tooltips/legends/table build DOM with `textContent` — API strings are
  untrusted; no `innerHTML` concatenation anywhere.

## Gotchas

- `sparkline_in_7d.price` is hourly with **no timestamps**; timestamps are
  reconstructed backward from `fetchedAt` (see `renderPerf()`).
- CoinGecko free tier rate-limits aggressively: one `coins/markets` call +
  one `global` call per refresh, never more. Widen calls, don't add them.
- The hourly snapshot commit intentionally triggers the Pages deploy — the
  published site's fallback data stays fresh without any server.
- The Fear & Greed index (alternative.me) is a **secondary, optional** source:
  fetched with `.catch(() => null)` in both `js/api.js` and the snapshot
  script, and its tile simply doesn't render when absent. A secondary source
  must never block or fail market data. It updates daily, not hourly.
