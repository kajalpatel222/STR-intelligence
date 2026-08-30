import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdminClient } from "../lib/supabase-admin.js";

export type StoredHomeSnapshot = Readonly<{
  snapshotId: string;
  canonicalPropertyId: string;
  observedAt: string;
  price?: number;
  statusText?: string;
  beds?: number;
  baths?: number;
  livingAreaSqft?: number;
  lotAreaSqft?: number;
  description?: string;
  amenities: readonly string[];
  propertyType?: string;
  address?: string;
  city?: string;
  county?: string;
  state?: string;
  postalCode?: string;
}>;

export type StoredHome = Readonly<{
  canonicalPropertyId: string;
  latest: StoredHomeSnapshot;
  history: readonly StoredHomeSnapshot[];
}>;

export interface StoredHomeSnapshotSource {
  readExistingHomeSnapshots(): Promise<readonly StoredHomeSnapshot[]>;
}

export interface StoredHomeRepositoryPort {
  listStoredHomes(): Promise<readonly StoredHome[]>;
}

export class StoredHomeRepository implements StoredHomeRepositoryPort {
  constructor(private readonly source: StoredHomeSnapshotSource = new SupabaseStoredHomeSnapshotSource()) {}

  async listStoredHomes(): Promise<readonly StoredHome[]> {
    const snapshots = await this.source.readExistingHomeSnapshots();
    const grouped = new Map<string, StoredHomeSnapshot[]>();
    for (const snapshot of snapshots) {
      const group = grouped.get(snapshot.canonicalPropertyId) ?? [];
      group.push(snapshot);
      grouped.set(snapshot.canonicalPropertyId, group);
    }

    return Object.freeze([...grouped.entries()].map(([canonicalPropertyId, records]) => {
      const history = [...records].sort((left, right) => left.observedAt.localeCompare(right.observedAt));
      return Object.freeze({
        canonicalPropertyId,
        latest: history.at(-1)!,
        history: Object.freeze([...history]),
      });
    }));
  }
}

type SnapshotRow = {
  id: string;
  canonical_property_id: string;
  observed_at: string;
  list_price: number | string | null;
  status_text: string | null;
  beds: number | string | null;
  baths: number | string | null;
  sqft: number | string | null;
  lot_sqft: number | string | null;
  description: string | null;
  amenities: unknown;
  canonical_properties: {
    current_use: string | null;
    address_line1: string | null;
    city: string | null;
    county: string | null;
    state: string | null;
    zip_code: string | null;
  };
};

export class SupabaseStoredHomeSnapshotSource implements StoredHomeSnapshotSource {
  constructor(private readonly client: SupabaseClient = getSupabaseAdminClient()) {}

  async readExistingHomeSnapshots(): Promise<readonly StoredHomeSnapshot[]> {
    // The inner relation applies the home filter in PostgreSQL so parcel rows never enter evaluation.
    const { data, error } = await this.client
      .from("listing_snapshots")
      .select("id,canonical_property_id,observed_at,list_price,status_text,beds,baths,sqft,lot_sqft,description,amenities,canonical_properties!inner(current_use,address_line1,city,county,state,zip_code)")
      .eq("canonical_properties.property_kind", "existing_home")
      .not("canonical_property_id", "is", null)
      .order("observed_at", { ascending: true });
    if (error) throw new Error("Unable to load stored homes for evaluation.");

    return Object.freeze(((data ?? []) as unknown as SnapshotRow[]).map((row) => Object.freeze({
      snapshotId: row.id,
      canonicalPropertyId: row.canonical_property_id,
      observedAt: row.observed_at,
      price: optionalNumber(row.list_price),
      statusText: row.status_text ?? undefined,
      beds: optionalNumber(row.beds),
      baths: optionalNumber(row.baths),
      livingAreaSqft: optionalNumber(row.sqft),
      lotAreaSqft: optionalNumber(row.lot_sqft),
      description: row.description ?? undefined,
      amenities: Object.freeze(Array.isArray(row.amenities) ? row.amenities.filter((value): value is string => typeof value === "string") : []),
      propertyType: row.canonical_properties.current_use ?? undefined,
      address: row.canonical_properties.address_line1 ?? undefined,
      city: row.canonical_properties.city ?? undefined,
      county: row.canonical_properties.county ?? undefined,
      state: row.canonical_properties.state ?? undefined,
      postalCode: row.canonical_properties.zip_code ?? undefined,
    })));
  }
}

function optionalNumber(value: number | string | null): number | undefined {
  if (value === null) return undefined;
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}
