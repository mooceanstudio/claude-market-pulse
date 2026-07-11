// Hand-rolled SVG charts — no chart library.
//
// Mark specs (see CLAUDE.md § Design system):
//   lines 2px round join/cap · end markers r4 with a 2px surface ring ·
//   bars ≤24px thick, 4px rounded data-end, square at the baseline ·
//   hairline solid gridlines · text wears text tokens, never series color.
// Every chart ships its hover layer: crosshair + all-series tooltip on
// lines, per-mark tooltip on bars. Labels from the API are inserted with
// textContent only.

const SVG_NS = "http://www.w3.org/2000/svg";

function svgEl(tag, attrs = {}) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  return node;
}

function surfaceColor() {
  return getComputedStyle(document.documentElement)
    .getPropertyValue("--surface-1").trim();
}

// Round a raw span to clean tick values (1/2/5 × 10^n).
function niceTicks(min, max, target = 5) {
  if (min === max) { min -= 1; max += 1; }
  const span = max - min;
  const step0 = span / Math.max(1, target - 1);
  const mag = 10 ** Math.floor(Math.log10(step0));
  const step = [1, 2, 5, 10].map(m => m * mag).find(s => span / s <= target - 0.5) || 10 * mag;
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;   // scale must cover the data max
  const ticks = [];
  for (let v = lo; v <= hi + step * 0.001; v += step) ticks.push(+v.toFixed(10));
  return ticks;
}

/* ---------- Tooltip (one per page; enhances, never gates) ---------- */

const tip = () => document.getElementById("tooltip");

export function hideTooltip() {
  const t = tip();
  t.hidden = true;
}

// rows: [{ key?: cssColor, name, value }] — names/values set via textContent.
function showTooltip(clientX, clientY, title, rows) {
  const t = tip();
  t.replaceChildren();

  const h = document.createElement("div");
  h.className = "tooltip-title";
  h.textContent = title;
  t.appendChild(h);

  for (const r of rows) {
    const row = document.createElement("div");
    row.className = "tooltip-row";
    if (r.key) {
      const k = document.createElement("span");
      k.className = "tooltip-key";
      k.style.background = r.key;
      row.appendChild(k);
    }
    const name = document.createElement("span");
    name.className = "name";
    name.textContent = r.name;
    const val = document.createElement("span");
    val.className = "val";
    val.textContent = r.value;
    row.append(name, val);
    t.appendChild(row);
  }

  t.hidden = false;
  const pad = 14;
  const box = t.getBoundingClientRect();
  let x = clientX + pad;
  let y = clientY + pad;
  if (x + box.width > window.innerWidth - 8) x = clientX - box.width - pad;
  if (y + box.height > window.innerHeight - 8) y = clientY - box.height - pad;
  t.style.left = `${x}px`;
  t.style.top = `${y}px`;
}

/* ---------- Multi-series line chart ---------- */

// series: [{ name, color, values: number[] }] — all series share `times` (Date[]).
export function renderLineChart(container, { series, times, yFormat, yAxisFormat = yFormat, xTickFormat }) {
  const W = 720, H = 300;
  const M = { top: 12, right: 58, bottom: 26, left: 46 };
  const iw = W - M.left - M.right, ih = H - M.top - M.bottom;

  const all = series.flatMap(s => s.values);
  const ticks = niceTicks(Math.min(...all), Math.max(...all), 5);
  const yMin = ticks[0], yMax = ticks[ticks.length - 1];
  const n = times.length;

  const x = i => M.left + (i / (n - 1)) * iw;
  const y = v => M.top + (1 - (v - yMin) / (yMax - yMin)) * ih;

  const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}`, role: "img" });

  // gridlines + y ticks (recessive, hairline)
  for (const t of ticks) {
    svg.appendChild(svgEl("line", {
      class: "gridline", x1: M.left, x2: M.left + iw, y1: y(t), y2: y(t),
    }));
    const lbl = svgEl("text", { class: "axis-text", x: M.left - 8, y: y(t) + 3.5, "text-anchor": "end" });
    lbl.textContent = yAxisFormat(t);
    svg.appendChild(lbl);
  }

  // x ticks — for a 7-day range, 8 ticks land on day boundaries
  const tickCount = Math.min(n >= 150 ? 8 : 7, n);
  for (let k = 0; k < tickCount; k++) {
    const i = Math.round((k / (tickCount - 1)) * (n - 1));
    const lbl = svgEl("text", {
      class: "axis-text", x: x(i), y: H - 8,
      "text-anchor": k === 0 ? "start" : k === tickCount - 1 ? "end" : "middle",
    });
    lbl.textContent = xTickFormat(times[i]);
    svg.appendChild(lbl);
  }

  // crosshair (hidden until hover)
  const crosshair = svgEl("line", {
    class: "crosshair", y1: M.top, y2: M.top + ih, visibility: "hidden",
  });
  svg.appendChild(crosshair);

  // series lines + end markers
  const surface = surfaceColor();
  for (const s of series) {
    const d = s.values.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(2)},${y(v).toFixed(2)}`).join("");
    svg.appendChild(svgEl("path", {
      d, fill: "none", stroke: s.color, "stroke-width": 2,
      "stroke-linejoin": "round", "stroke-linecap": "round",
    }));
    const ex = x(n - 1), ey = y(s.values[n - 1]);
    // end marker with a 2px surface ring so it survives line crossings
    svg.appendChild(svgEl("circle", { cx: ex, cy: ey, r: 6, fill: surface }));
    svg.appendChild(svgEl("circle", { cx: ex, cy: ey, r: 4, fill: s.color }));
  }

  // direct end labels — selective: drop (not stack) any label that would
  // collide with one already placed; the legend + tooltip still carry it.
  const placed = [];
  const byEnd = series
    .map(s => ({ s, ey: y(s.values[n - 1]) }))
    .sort((a, b) => a.ey - b.ey);
  for (const { s, ey } of byEnd) {
    if (placed.some(p => Math.abs(p - ey) < 13)) continue;
    placed.push(ey);
    const lbl = svgEl("text", { class: "end-label", x: x(n - 1) + 10, y: ey + 3.5 });
    lbl.textContent = s.name;
    svg.appendChild(lbl);
  }

  // hover layer: the whole plot is the hit target; crosshair snaps to
  // the nearest X and one tooltip reads out every series.
  const overlay = svgEl("rect", {
    x: M.left, y: M.top, width: iw, height: ih,
    fill: "transparent",
  });
  overlay.addEventListener("pointermove", ev => {
    const rect = svg.getBoundingClientRect();
    const px = ((ev.clientX - rect.left) / rect.width) * W;
    const i = Math.max(0, Math.min(n - 1, Math.round(((px - M.left) / iw) * (n - 1))));
    crosshair.setAttribute("x1", x(i));
    crosshair.setAttribute("x2", x(i));
    crosshair.setAttribute("visibility", "visible");
    const when = times[i].toLocaleString("en-US", {
      weekday: "short", hour: "numeric", hour12: true,
    });
    showTooltip(ev.clientX, ev.clientY, when, series.map(s => ({
      key: s.color, name: s.name, value: yFormat(s.values[i]),
    })));
  });
  overlay.addEventListener("pointerleave", () => {
    crosshair.setAttribute("visibility", "hidden");
    hideTooltip();
  });
  svg.appendChild(overlay);

  container.replaceChildren(svg);
}

/* ---------- Horizontal bar chart ---------- */

// items: [{ label, value, tooltipRows }] — single measure, so a single hue.
export function renderBarChart(container, { items, color, format }) {
  const W = 480;
  const rowH = 34, barMax = 24;
  const M = { top: 6, right: 64, bottom: 20, left: 48 };
  const H = M.top + items.length * rowH + M.bottom;
  const iw = W - M.left - M.right;

  const max = Math.max(...items.map(d => d.value));
  const ticks = niceTicks(0, max, 4);
  const xMax = ticks[ticks.length - 1];
  const x = v => M.left + (v / xMax) * iw;

  const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}`, role: "img" });

  for (const t of ticks) {
    if (t === 0) continue;
    svg.appendChild(svgEl("line", {
      class: "gridline", x1: x(t), x2: x(t), y1: M.top, y2: H - M.bottom,
    }));
    const lbl = svgEl("text", { class: "axis-text", x: x(t), y: H - 6, "text-anchor": "middle" });
    lbl.textContent = format(t, { axis: true });
    svg.appendChild(lbl);
  }

  // baseline
  svg.appendChild(svgEl("line", {
    class: "baseline", x1: M.left, x2: M.left, y1: M.top, y2: H - M.bottom,
  }));

  const barH = Math.min(barMax, rowH - 10);
  items.forEach((d, i) => {
    const cy = M.top + i * rowH + rowH / 2;
    const w = Math.max(2, x(d.value) - M.left);
    const r = Math.min(4, w / 2);

    // square at the baseline, 4px rounded data-end
    const bar = svgEl("path", {
      d: `M${M.left},${cy - barH / 2}
          h${w - r} a${r},${r} 0 0 1 ${r},${r}
          v${barH - 2 * r} a${r},${r} 0 0 1 ${-r},${r}
          h${-(w - r)} z`,
      fill: color,
    });

    const cat = svgEl("text", {
      class: "axis-text", x: M.left - 8, y: cy + 3.5, "text-anchor": "end",
    });
    cat.textContent = d.label;

    const val = svgEl("text", { class: "bar-value", x: x(d.value) + 8, y: cy + 3.5 });
    val.textContent = format(d.value);

    // hit target is the full row, not just the painted bar
    const hit = svgEl("rect", {
      x: 0, y: M.top + i * rowH, width: W, height: rowH, fill: "transparent",
    });
    hit.addEventListener("pointermove", ev => {
      bar.setAttribute("opacity", "0.8");
      showTooltip(ev.clientX, ev.clientY, d.label, d.tooltipRows);
    });
    hit.addEventListener("pointerleave", () => {
      bar.removeAttribute("opacity");
      hideTooltip();
    });

    svg.append(bar, cat, val, hit);
  });

  container.replaceChildren(svg);
}

/* ---------- Sparkline (stat tiles & table rows) ---------- */

// Downsample to ~`points` and draw a 2px line. History wears the
// de-emphasis hue; the current period (last segment) wears `accent`.
export function sparkline(values, { width = 120, height = 28, accent, dim, points = 24 } = {}) {
  const step = Math.max(1, Math.floor(values.length / points));
  const v = values.filter((_, i) => i % step === 0 || i === values.length - 1);
  const min = Math.min(...v), max = Math.max(...v);
  const pad = 3;
  const x = i => pad + (i / (v.length - 1)) * (width - 2 * pad);
  const y = val => max === min
    ? height / 2
    : pad + (1 - (val - min) / (max - min)) * (height - 2 * pad);

  const svg = svgEl("svg", {
    viewBox: `0 0 ${width} ${height}`, width, height, "aria-hidden": "true",
  });

  const histD = v.slice(0, -1).map((val, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(val).toFixed(1)}`).join("");
  svg.appendChild(svgEl("path", {
    d: histD, fill: "none", stroke: dim, "stroke-width": 2,
    "stroke-linejoin": "round", "stroke-linecap": "round",
  }));

  const iLast = v.length - 1;
  svg.appendChild(svgEl("path", {
    d: `M${x(iLast - 1).toFixed(1)},${y(v[iLast - 1]).toFixed(1)}L${x(iLast).toFixed(1)},${y(v[iLast]).toFixed(1)}`,
    fill: "none", stroke: accent, "stroke-width": 2, "stroke-linecap": "round",
  }));
  svg.appendChild(svgEl("circle", { cx: x(iLast), cy: y(v[iLast]), r: 3, fill: accent }));

  return svg;
}
