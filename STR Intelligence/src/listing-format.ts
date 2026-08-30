type LandArea = Readonly<{ lotAcres?: number; lotSqft?: number }>;

export function formatLandArea(listing: LandArea) {
  if (listing.lotAcres !== undefined && listing.lotAcres > 0) {
    return `${listing.lotAcres.toLocaleString("en-US", { maximumFractionDigits: 4 })} acres`;
  }
  if (listing.lotSqft !== undefined && listing.lotSqft > 0) {
    return listing.lotSqft >= 43_560
      ? `${(listing.lotSqft / 43_560).toLocaleString("en-US", { maximumFractionDigits: 2 })} acres`
      : `${listing.lotSqft.toLocaleString()} sq ft`;
  }
  return undefined;
}
