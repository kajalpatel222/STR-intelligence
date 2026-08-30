import { validateInvestmentCriteria, type InvestmentCriteria } from "../shared/investment-criteria";

export type InvestmentCriteriaClient = Readonly<{
  load(): Promise<InvestmentCriteria>;
  save(criteria: InvestmentCriteria): Promise<InvestmentCriteria>;
}>;

export function createInvestmentCriteriaClient(fetcher: typeof fetch = fetch): InvestmentCriteriaClient {
  return {
    async load() {
      const response = await fetcher("/api/investment-criteria");
      if (!response.ok) throw new Error("Saved defaults could not be loaded.");
      const body = await response.json() as { criteria?: unknown };
      const validation = validateInvestmentCriteria(body.criteria);
      if (!validation.ok) throw new Error("Saved defaults could not be loaded.");
      return validation.value;
    },
    async save(criteria) {
      const response = await fetcher("/api/investment-criteria", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ criteria }),
      });
      const body = await response.json() as { criteria?: InvestmentCriteria; message?: string };
      if (!response.ok || !body.criteria) throw new Error(body.message ?? "Defaults could not be saved.");
      const validation = validateInvestmentCriteria(body.criteria);
      if (!validation.ok) throw new Error("Defaults could not be saved.");
      return validation.value;
    },
  };
}

export const investmentCriteriaClient = createInvestmentCriteriaClient();
