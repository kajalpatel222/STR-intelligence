export type ZillowListingUrlValidation =
  | Readonly<{ ok: true; url: string; location: "Oakhurst, CA" | "Mariposa, CA" }>
  | Readonly<{ ok: false; message: string }>;

export function validateZillowListingUrl(value: unknown): ZillowListingUrlValidation {
  if (typeof value !== "string" || !value.trim()) {
    return { ok: false, message: "Paste a Zillow home listing URL." };
  }
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:" || !/(^|\.)zillow\.com$/i.test(url.hostname)) {
      return { ok: false, message: "Use a valid Zillow listing URL." };
    }
    if (!/\/homedetails\//i.test(url.pathname) || !/\d+_zpid\/?$/i.test(url.pathname)) {
      return { ok: false, message: "Use the full Zillow home-details URL." };
    }
    const decodedPath = decodeURIComponent(url.pathname).replaceAll("-", " ");
    const location = /\bOakhurst CA\b/i.test(decodedPath)
      ? "Oakhurst, CA" as const
      : /\bMariposa CA\b/i.test(decodedPath)
        ? "Mariposa, CA" as const
        : undefined;
    if (!location) {
      return { ok: false, message: "Direct listing analysis currently supports homes in Oakhurst or Mariposa." };
    }
    url.hash = "";
    return { ok: true, url: url.toString(), location };
  } catch {
    return { ok: false, message: "Use a valid Zillow listing URL." };
  }
}
