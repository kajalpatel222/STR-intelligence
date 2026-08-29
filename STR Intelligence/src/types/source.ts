export type SourceKind = "zillow" | "land";

export interface RawSourceListing {
  source: SourceKind;
  externalId: string;
  url: string;
  discoveredAt: string;
  payload: unknown;
}
