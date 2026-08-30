import type { SupabaseClient } from "@supabase/supabase-js";
import {
  DEFAULT_INVESTMENT_CRITERIA,
  createInvestmentCriteriaSnapshot,
  type InvestmentCriteria,
} from "../../shared/investment-criteria.js";
import { getSupabaseAdminClient } from "../lib/supabase-admin.js";

const DEFAULT_PROFILE_KEY = "default";

type CriteriaRow = Readonly<{
  profile_key: string;
  minimum_purchase_budget_usd: number;
  maximum_purchase_budget_usd: number;
  maximum_improvement_reserve_usd: number;
  mode: "strict" | "flexible";
}>;

export interface CriteriaDefaultsStore {
  read(profileKey: string): Promise<CriteriaRow | null>;
  write(row: CriteriaRow): Promise<CriteriaRow>;
}

export interface InvestmentCriteriaRepository {
  getDefaults(): Promise<InvestmentCriteria>;
  saveDefaults(criteria: InvestmentCriteria): Promise<InvestmentCriteria>;
}

export class SupabaseCriteriaDefaultsStore implements CriteriaDefaultsStore {
  constructor(private readonly client: SupabaseClient = getSupabaseAdminClient()) {}

  async read(profileKey: string) {
    const { data, error } = await this.client
      .from("investment_criteria_profiles")
      .select("profile_key,minimum_purchase_budget_usd,maximum_purchase_budget_usd,maximum_improvement_reserve_usd,mode")
      .eq("profile_key", profileKey)
      .maybeSingle();
    if (error) throw new Error("Unable to load investment criteria defaults.");
    return data as CriteriaRow | null;
  }

  async write(row: CriteriaRow) {
    const { data, error } = await this.client
      .from("investment_criteria_profiles")
      .upsert(row, { onConflict: "profile_key" })
      .select("profile_key,minimum_purchase_budget_usd,maximum_purchase_budget_usd,maximum_improvement_reserve_usd,mode")
      .single();
    if (error || !data) throw new Error("Unable to save investment criteria defaults.");
    return data as CriteriaRow;
  }
}

export class CriteriaDefaultsRepository implements InvestmentCriteriaRepository {
  constructor(private readonly store: CriteriaDefaultsStore = new SupabaseCriteriaDefaultsStore()) {}

  async getDefaults() {
    const row = await this.store.read(DEFAULT_PROFILE_KEY);
    return row ? fromRow(row) : createInvestmentCriteriaSnapshot(DEFAULT_INVESTMENT_CRITERIA);
  }

  async saveDefaults(criteria: InvestmentCriteria) {
    // A fixed key is honest for the current single-user app; it can become a user_id after authentication exists.
    return fromRow(await this.store.write(toRow(createInvestmentCriteriaSnapshot(criteria))));
  }
}

function toRow(criteria: InvestmentCriteria): CriteriaRow {
  return {
    profile_key: DEFAULT_PROFILE_KEY,
    minimum_purchase_budget_usd: criteria.minimumPurchaseBudgetUsd,
    maximum_purchase_budget_usd: criteria.maximumPurchaseBudgetUsd,
    maximum_improvement_reserve_usd: criteria.maximumImprovementReserveUsd,
    mode: criteria.mode,
  };
}

function fromRow(row: CriteriaRow): InvestmentCriteria {
  return createInvestmentCriteriaSnapshot({
    minimumPurchaseBudgetUsd: Number(row.minimum_purchase_budget_usd),
    maximumPurchaseBudgetUsd: Number(row.maximum_purchase_budget_usd),
    maximumImprovementReserveUsd: Number(row.maximum_improvement_reserve_usd),
    mode: row.mode,
  });
}
