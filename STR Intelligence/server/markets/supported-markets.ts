export const SUPPORTED_MARKETS = {
  "Oakhurst, CA": {
    name: "Oakhurst",
    state: "CA",
    bounds: { west: -119.78, east: -119.58, south: 37.25, north: 37.4 },
  },
  "Mariposa, CA": {
    name: "Mariposa",
    state: "CA",
    bounds: { west: -120.02, east: -119.82, south: 37.42, north: 37.58 },
  },
} as const;

export type SupportedMarketLocation = keyof typeof SUPPORTED_MARKETS;

export function normalizeSupportedLocation(value: unknown): SupportedMarketLocation | undefined {
  if (value === undefined || value === null || value === "") return "Oakhurst, CA";
  if (typeof value !== "string" || value.length > 100) return undefined;
  const normalized = value.trim().replace(/,?\s+(?:california)$/i, ", CA");
  return (Object.keys(SUPPORTED_MARKETS) as SupportedMarketLocation[])
    .find((location) => location.toLowerCase() === normalized.toLowerCase());
}
