import type { AttentionListingInput, PublicAttentionEvaluation } from "../shared/attention-api.js";
import type { InvestmentCriteria } from "../shared/investment-criteria.js";

export async function evaluateCurrentListings(
  criteria: InvestmentCriteria,
  listings: readonly AttentionListingInput[],
  fetcher: typeof fetch = fetch,
): Promise<PublicAttentionEvaluation[]> {
  const response = await fetcher("/api/attention-evaluation", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ criteria, listings }),
  });
  const outcome = await response.json() as { message?: string; evaluations?: PublicAttentionEvaluation[] };
  if (!response.ok || !outcome.evaluations) throw new Error(outcome.message ?? "Scores could not be updated.");
  return outcome.evaluations;
}
