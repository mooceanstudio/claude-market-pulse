// Market table — the always-reachable, no-hover view of every value the
// charts show. Sortable by any numeric column. API strings are inserted
// with textContent only.

import { usd, compactUsd, pct } from "./format.js";
import { sparkline } from "./charts.js";
import { cssVar } from "./config.js";

const COLUMNS = [
  { key: "market_cap_rank", label: "#", numeric: true },
  { key: "name", label: "Coin", numeric: false },
  { key: "current_price", label: "Price", numeric: true },
  { key: "price_change_percentage_24h", label: "24h", numeric: true },
  { key: "price_change_percentage_7d_in_currency", label: "7d", numeric: true },
  { key: "market_cap", label: "Market cap", numeric: true },
  { key: "total_volume", label: "Volume (24h)", numeric: true },
  { key: null, label: "Last 7 days", numeric: false },
];

let sortKey = "market_cap_rank";
let sortDir = 1;

export function renderTable(tableEl, coins) {
  const thead = tableEl.querySelector("thead");
  const tbody = tableEl.querySelector("tbody");

  // header
  const hr = document.createElement("tr");
  for (const col of COLUMNS) {
    const th = document.createElement("th");
    th.textContent = col.label;
    if (col.key) {
      th.setAttribute("aria-sort", sortKey === col.key
        ? (sortDir === 1 ? "ascending" : "descending") : "none");
      if (sortKey === col.key) {
        const arrow = document.createElement("span");
        arrow.className = "arrow";
        arrow.textContent = sortDir === 1 ? " ▲" : " ▼";
        th.appendChild(arrow);
      }
      th.addEventListener("click", () => {
        sortDir = sortKey === col.key ? -sortDir : (col.key === "market_cap_rank" ? 1 : -1);
        sortKey = col.key;
        renderTable(tableEl, coins);
      });
    } else {
      th.style.cursor = "default";
    }
    hr.appendChild(th);
  }
  thead.replaceChildren(hr);

  // rows
  const rows = [...coins].sort((a, b) => {
    const av = a[sortKey], bv = b[sortKey];
    if (typeof av === "string") return sortDir * av.localeCompare(bv);
    return sortDir * ((av ?? 0) - (bv ?? 0));
  });

  const up = cssVar("--delta-up");
  const down = cssVar("--delta-down");
  const frag = document.createDocumentFragment();

  for (const c of rows) {
    const tr = document.createElement("tr");

    tr.appendChild(td(String(c.market_cap_rank)));

    const coinTd = document.createElement("td");
    const wrap = document.createElement("span");
    wrap.className = "coin";
    if (c.image) {
      const img = document.createElement("img");
      img.src = c.image;
      img.alt = "";
      img.loading = "lazy";
      wrap.appendChild(img);
    }
    const name = document.createElement("span");
    name.textContent = c.name;
    const sym = document.createElement("span");
    sym.className = "sym";
    sym.textContent = c.symbol;
    wrap.append(name, sym);
    coinTd.appendChild(wrap);
    tr.appendChild(coinTd);

    tr.appendChild(td(usd(c.current_price)));
    tr.appendChild(deltaTd(c.price_change_percentage_24h));
    tr.appendChild(deltaTd(c.price_change_percentage_7d_in_currency));
    tr.appendChild(td(compactUsd(c.market_cap)));
    tr.appendChild(td(compactUsd(c.total_volume)));

    const sparkTd = document.createElement("td");
    const prices = c.sparkline_in_7d?.price;
    if (prices?.length > 2) {
      const dirColor = (prices[prices.length - 1] >= prices[0]) ? up : down;
      sparkTd.appendChild(sparkline(prices, {
        width: 110, height: 26, accent: dirColor, dim: cssVar("--spark-dim"),
      }));
    }
    tr.appendChild(sparkTd);

    frag.appendChild(tr);
  }
  tbody.replaceChildren(frag);
}

function td(text) {
  const cell = document.createElement("td");
  cell.textContent = text;
  return cell;
}

function deltaTd(value) {
  // values that round to 0.00% read as neutral, not "-0.00%" in red
  const zero = value != null && Math.abs(value) < 0.005;
  const cell = td(zero ? "0.00%" : pct(value));
  if (value != null && !zero) cell.className = value >= 0 ? "up" : "down";
  return cell;
}
