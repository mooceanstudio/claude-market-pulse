// Central configuration — data sources, refresh cadence, series palette.

export const API_BASE = "https://api.coingecko.com/api/v3";
export const SNAPSHOT_URL = "data/snapshot.json";

export const REFRESH_SECONDS = 60;

export const TABLE_COINS = 10;   // rows in the market table
export const VOLUME_COINS = 8;   // bars in the volume chart
export const PERF_COINS = 5;     // series in the performance chart

// Categorical slots in fixed order — a series keeps its slot even when
// filters change the series count (color follows the entity, not its rank).
export const SERIES_VARS = [
  "--series-1", "--series-2", "--series-3", "--series-4",
  "--series-5", "--series-6", "--series-7", "--series-8",
];

export function seriesColor(i) {
  const v = SERIES_VARS[i % SERIES_VARS.length];
  return getComputedStyle(document.documentElement).getPropertyValue(v).trim();
}

export function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}
