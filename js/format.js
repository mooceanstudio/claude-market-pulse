// Number formatting helpers. All values are USD unless noted.

const COMPACT = new Intl.NumberFormat("en-US", {
  notation: "compact", maximumFractionDigits: 2,
});

export function compactUsd(n) {
  if (n == null || Number.isNaN(n)) return "—";
  return "$" + COMPACT.format(n);
}

export function usd(n) {
  if (n == null || Number.isNaN(n)) return "—";
  const digits = n >= 1000 ? 0 : n >= 1 ? 2 : 4;
  return n.toLocaleString("en-US", {
    style: "currency", currency: "USD",
    minimumFractionDigits: digits, maximumFractionDigits: digits,
  });
}

export function pct(n, { signed = true } = {}) {
  if (n == null || Number.isNaN(n)) return "—";
  const sign = signed && n > 0 ? "+" : "";
  return `${sign}${n.toFixed(2)}%`;
}

export function timeAgo(iso) {
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 90) return `${s}s ago`;
  if (s < 5400) return `${Math.round(s / 60)}m ago`;
  return `${Math.round(s / 3600)}h ago`;
}

// "Tue 08" style tick for the time axis
export function dayTick(date) {
  return date.toLocaleDateString("en-US", { weekday: "short" });
}

export function hourTick(date) {
  return date.toLocaleTimeString("en-US", { hour: "numeric", hour12: true });
}
