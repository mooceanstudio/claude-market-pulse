// App shell: state, refresh loop, theme, and render orchestration.
//
// Data flow:  fetchData() → state → renderAll()
// The 60s loop refetches; while a refetch is in flight the previous
// render stays on screen at reduced opacity (no skeleton, no jump).

import { REFRESH_SECONDS, PERF_COINS, VOLUME_COINS, seriesColor, cssVar } from "./config.js";
import { fetchData } from "./api.js";
import { renderLineChart, renderBarChart, sparkline, hideTooltip } from "./charts.js";
import { renderTable } from "./table.js";
import { usd, compactUsd, pct, timeAgo, dayTick, hourTick } from "./format.js";

const state = {
  data: null,
  rangeHours: 168,
  paused: false,
  countdown: REFRESH_SECONDS,
};

const $ = id => document.getElementById(id);

/* ---------- Theme ---------- */

function initTheme() {
  // ?theme=dark|light wins (handy for demos/screenshots), then the saved
  // preference, then the OS setting via prefers-color-scheme.
  const fromUrl = new URLSearchParams(location.search).get("theme");
  const saved = fromUrl || localStorage.getItem("theme");
  if (saved) document.documentElement.dataset.theme = saved;
  $("theme-btn").addEventListener("click", () => {
    const cur = document.documentElement.dataset.theme ||
      (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    const next = cur === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    localStorage.setItem("theme", next);
    if (state.data) renderAll();   // SVG colors are resolved at render time
  });
}

/* ---------- Stat tiles ---------- */

function tile({ label, value, delta, deltaVs, spark, sparkAccent }) {
  const el = document.createElement("article");
  el.className = "tile";

  const l = document.createElement("div");
  l.className = "tile-label";
  l.textContent = label;

  const v = document.createElement("div");
  v.className = "tile-value";
  v.textContent = value;

  el.append(l, v);

  if (delta != null && !Number.isNaN(delta)) {
    const d = document.createElement("div");
    d.className = `tile-delta ${delta >= 0 ? "up" : "down"}`;
    d.textContent = `${delta >= 0 ? "▲" : "▼"} ${pct(Math.abs(delta), { signed: false })} `;
    const vs = document.createElement("span");
    vs.className = "vs";
    vs.textContent = `vs ${deltaVs}`;
    d.appendChild(vs);
    el.appendChild(d);
  }

  if (spark?.length > 2) {
    el.appendChild(sparkline(spark, {
      width: 220, height: 30,
      accent: sparkAccent, dim: cssVar("--spark-dim"),
    }));
  }
  return el;
}

function renderTiles() {
  const { global, markets } = state.data;
  const btc = markets.find(c => c.id === "bitcoin") ?? markets[0];
  const eth = markets.find(c => c.id === "ethereum");
  const slice = arr => arr.slice(-state.rangeHours);

  const tiles = [
    tile({
      label: "Total market cap",
      value: compactUsd(global.total_market_cap?.usd),
      delta: global.market_cap_change_percentage_24h_usd,
      deltaVs: "24h ago",
    }),
    tile({
      label: "24h trading volume",
      value: compactUsd(global.total_volume?.usd),
    }),
    tile({
      label: `Bitcoin price · ${pct(global.market_cap_percentage?.btc, { signed: false })} dominance`,
      value: usd(btc.current_price),
      delta: btc.price_change_percentage_24h,
      deltaVs: "24h ago",
      spark: slice(btc.sparkline_in_7d?.price ?? []),
      sparkAccent: seriesColor(0),
    }),
    eth && tile({
      label: `Ethereum price · ${pct(global.market_cap_percentage?.eth, { signed: false })} dominance`,
      value: usd(eth.current_price),
      delta: eth.price_change_percentage_24h,
      deltaVs: "24h ago",
      spark: slice(eth.sparkline_in_7d?.price ?? []),
      sparkAccent: seriesColor(1),
    }),
  ].filter(Boolean);

  $("tiles").replaceChildren(...tiles);
}

/* ---------- Performance chart ---------- */

// Stablecoins are pegged — a flat 0% line by definition — so they'd waste
// series slots in a performance comparison. They stay in the volume chart
// and the table, where they're meaningful.
const STABLE = new Set(["usdt", "usdc", "dai", "busd", "tusd", "fdusd", "usde", "usds"]);

function renderPerf() {
  const { markets, fetchedAt } = state.data;
  const top = markets
    .filter(c => !STABLE.has(c.symbol) && c.sparkline_in_7d?.price?.length > 2)
    .slice(0, PERF_COINS);

  const nAvail = Math.min(...top.map(c => c.sparkline_in_7d.price.length));
  const n = Math.min(state.rangeHours, nAvail);

  // sparkline_in_7d is hourly and ends at fetch time; rebuild timestamps
  const end = new Date(fetchedAt).getTime();
  const times = Array.from({ length: n }, (_, i) =>
    new Date(end - (n - 1 - i) * 3600_000));

  const series = top.map((c, i) => {
    const p = c.sparkline_in_7d.price.slice(-n);
    return {
      name: c.symbol.toUpperCase(),
      color: seriesColor(i),           // fixed slot per entity, never cycled
      values: p.map(v => (v / p[0] - 1) * 100),
    };
  });

  renderLineChart($("perf-chart"), {
    series, times,
    yFormat: v => pct(v),
    yAxisFormat: v => `${v > 0 ? "+" : ""}${v}%`,   // ticks are clean integers
    xTickFormat: state.rangeHours <= 24
      ? hourTick
      : state.rangeHours <= 96
        ? d => `${dayTick(d)} ${hourTick(d)}`
        : dayTick,
  });

  // legend — always present for ≥2 series; keys mirror the mark (a line)
  const legend = series.map(s => {
    const item = document.createElement("span");
    item.className = "legend-item";
    const key = document.createElement("span");
    key.className = "legend-key";
    key.style.background = s.color;
    const name = document.createElement("span");
    name.textContent = s.name;
    item.append(key, name);
    return item;
  });
  $("perf-legend").replaceChildren(...legend);
}

/* ---------- Volume chart ---------- */

function renderVolume() {
  const items = [...state.data.markets]
    .sort((a, b) => b.total_volume - a.total_volume)
    .slice(0, VOLUME_COINS)
    .map(c => ({
      label: c.symbol.toUpperCase(),
      value: c.total_volume,
      tooltipRows: [
        { name: "Volume (24h)", value: compactUsd(c.total_volume) },
        { name: "Price", value: usd(c.current_price) },
        { name: "24h change", value: pct(c.price_change_percentage_24h) },
      ],
    }));

  // one measure across categories → a single hue; identity lives on the axis
  renderBarChart($("volume-chart"), {
    items,
    color: seriesColor(0),
    format: (v, opts = {}) => opts.axis ? compactUsd(v) : compactUsd(v),
  });
}

/* ---------- Status line ---------- */

function renderStatus() {
  const { source, fetchedAt } = state.data;
  const note = $("data-note");
  const dot = $("live-dot");
  if (source === "live") {
    note.textContent = `live data · updated ${timeAgo(fetchedAt)}`;
    dot.className = "live-dot";
  } else {
    note.textContent = `cached snapshot from ${timeAgo(fetchedAt)} (live API unreachable)`;
    dot.className = "live-dot error";
  }
}

function renderAll() {
  renderTiles();
  renderPerf();
  renderVolume();
  renderTable($("market-table"), state.data.markets);
  renderStatus();
}

/* ---------- Refresh loop ---------- */

async function refresh() {
  const main = document.querySelector(".dashboard");
  main.classList.add("refetching");
  hideTooltip();
  try {
    state.data = await fetchData();
    renderAll();
  } catch (err) {
    console.error("Refresh failed entirely:", err);
    $("refresh-status").textContent = "data unavailable";
    $("live-dot").className = "live-dot error";
  } finally {
    main.classList.remove("refetching");
    state.countdown = REFRESH_SECONDS;
  }
}

function tick() {
  if (state.paused || !state.data) return;
  state.countdown -= 1;
  if (state.countdown <= 0) {
    refresh();
  } else {
    $("refresh-status").textContent = `next update in ${state.countdown}s`;
  }
}

function initControls() {
  $("pause-btn").addEventListener("click", () => {
    state.paused = !state.paused;
    $("pause-btn").textContent = state.paused ? "Resume" : "Pause";
    $("live-dot").classList.toggle("paused", state.paused);
    $("refresh-status").textContent = state.paused ? "auto-refresh paused" : "resuming…";
    if (!state.paused) state.countdown = Math.min(state.countdown, 3);
  });

  $("range-picker").addEventListener("click", ev => {
    const btn = ev.target.closest("button[data-hours]");
    if (!btn) return;
    for (const b of $("range-picker").children) {
      b.classList.toggle("selected", b === btn);
      b.setAttribute("aria-pressed", String(b === btn));
    }
    state.rangeHours = Number(btn.dataset.hours);
    if (state.data) { renderTiles(); renderPerf(); }
  });
}

/* ---------- Boot ---------- */

initTheme();
initControls();
await refresh();
setInterval(tick, 1000);
