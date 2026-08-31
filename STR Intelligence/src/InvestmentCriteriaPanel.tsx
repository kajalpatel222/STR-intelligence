import React, { useState } from "react";
import {
  DEFAULT_INVESTMENT_CRITERIA,
  formatCriteriaCurrency,
  validateInvestmentCriteria,
  type InvestmentCriteria,
  type AttentionMode,
} from "../shared/investment-criteria";
type InvestmentCriteriaPanelProps = Readonly<{
  isApplying?: boolean;
  onApply?: (criteria: InvestmentCriteria) => Promise<void>;
}>;

export function InvestmentCriteriaPanel({
  isApplying = false,
  onApply,
}: InvestmentCriteriaPanelProps) {
  const [maximumBudget, setMaximumBudget] = useState<number>(DEFAULT_INVESTMENT_CRITERIA.maximumPurchaseBudgetUsd);
  const [improvementReserve, setImprovementReserve] = useState<number>(DEFAULT_INVESTMENT_CRITERIA.maximumImprovementReserveUsd);
  const [mode, setMode] = useState<AttentionMode>(DEFAULT_INVESTMENT_CRITERIA.mode);
  const [feedback, setFeedback] = useState("");

  async function applyCriteria() {
    const result = currentCriteria();
    if (!result.ok) {
      setFeedback(result.errors[0]?.message ?? "Check the investment criteria values.");
      return;
    }
    setFeedback("");
    try {
      await onApply?.(result.value);
      setFeedback("Scores updated.");
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Scores could not be updated.");
    }
  }

  function currentCriteria() {
    return validateInvestmentCriteria({
      minimumPurchaseBudgetUsd: 0,
      maximumPurchaseBudgetUsd: maximumBudget,
      maximumImprovementReserveUsd: improvementReserve,
      mode,
    });
  }

  return (
    <section className="criteria-panel" aria-labelledby="criteria-title">
      <div className="criteria-panel__heading">
        <div>
          <p className="criteria-panel__kicker">Investment criteria</p>
          <h3 id="criteria-title">Define what deserves attention</h3>
        </div>
        <p>Adjust these values, then apply them to the current homes.</p>
      </div>

      <div className="criteria-fields">
        <label className="criteria-control">
          <span>Maximum purchase budget</span>
          <input type="number" inputMode="numeric" min="0" step="5000" value={maximumBudget} onChange={(event) => setMaximumBudget(Number(event.target.value))} />
          <small>{formatCriteriaCurrency(maximumBudget)}</small>
        </label>
        <label className="criteria-control">
          <span>Maximum improvement reserve</span>
          <input type="number" inputMode="numeric" min="0" step="5000" value={improvementReserve} onChange={(event) => setImprovementReserve(Number(event.target.value))} />
          <small>{formatCriteriaCurrency(improvementReserve)}</small>
        </label>
      </div>

      <fieldset className="criteria-mode">
        <legend className="criteria-mode__legend">
          Strict or Flexible
          <span className="criteria-info">
            <button type="button" aria-label="About Strict and Flexible modes" aria-describedby="criteria-mode-tooltip">i</button>
            <span className="criteria-info__tooltip" id="criteria-mode-tooltip" role="tooltip">
              Strict applies the full penalty to homes above your purchase limit. Flexible keeps near-misses with a proportional penalty.
            </span>
          </span>
        </legend>
        <div className="criteria-mode__choices">
          <label className={mode === "strict" ? "is-selected" : ""}>
            <input type="radio" name="attention-mode" value="strict" checked={mode === "strict"} onChange={() => setMode("strict")} />
            <span><strong>Strict</strong></span>
          </label>
          <label className={mode === "flexible" ? "is-selected" : ""}>
            <input type="radio" name="attention-mode" value="flexible" checked={mode === "flexible"} onChange={() => setMode("flexible")} />
            <span><strong>Flexible</strong></span>
          </label>
        </div>
      </fieldset>

      <div className="criteria-panel__actions">
        {onApply && <button type="button" onClick={applyCriteria} disabled={isApplying}>
          {isApplying ? "Applying…" : "Apply Criteria"}
        </button>}
        {feedback && <p className="criteria-feedback" role="status">{feedback}</p>}
      </div>
    </section>
  );
}
