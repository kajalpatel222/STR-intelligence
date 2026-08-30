export function formatComparatorCurrency(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "Not available";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatComparatorPercent(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "Not available";
  return `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(value)}%`;
}

export function formatComparatorDistance(miles: number): string {
  return `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(miles)} mi`;
}

export function formatComparatorDate(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export function formatBedroomBathroomCount(value: number | undefined, singular: string): string {
  if (value === undefined || !Number.isFinite(value)) return `${singular} count unavailable`;
  return `${value} ${singular}${value === 1 ? "" : "s"}`;
}
