import { validateInvestmentCriteria } from "../../shared/investment-criteria.js";
import type { InvestmentCriteriaRepository } from "../criteria/repository.js";

export function createInvestmentCriteriaHandler(repository: InvestmentCriteriaRepository) {
  return {
    async get() {
      return response(200, { criteria: await repository.getDefaults() });
    },
    async put(input: unknown) {
      const body = input && typeof input === "object" ? input as Record<string, unknown> : {};
      const validation = validateInvestmentCriteria(body.criteria);
      if ("errors" in validation) {
        return response(400, {
          status: "invalid",
          message: validation.errors[0]?.message ?? "Check the investment criteria values.",
          errors: validation.errors,
        });
      }
      return response(200, { criteria: await repository.saveDefaults(validation.value) });
    },
  };
}

function response(statusCode: number, body: Record<string, unknown>) {
  return { statusCode, body } as const;
}
