import React, { useState } from "react";
import {
  DEFAULT_INVESTMENT_CRITERIA,
  formatCriteriaCurrency,
  type AttentionMode,
} from "./investment-criteria";

export function InvestmentCriteriaPanel() {
  const [minimumBudget, setMinimumBudget] = useState<number>(DEFAULT_INVESTMENT_CRITERIA.minimumPurchaseBudget);
  const [maximumBudget, setMaximumBudget] = useState<number>(DEFAULT_INVESTMENT_CRITERIA.maximumPurchaseBudget);
  const [improvementReserve, setImprovementReserve] = useState<number>(DEFAULT_INVESTMENT_CRITERIA.maximumImprovementReserve);
  const [mode, setMode] = useState<AttentionMode>(DEFAULT_INVESTMENT_CRITERIA.mode);

  return (
    <section className="criteria-panel" aria-labelledby="criteria-title">
      <div className="criteria-panel__heading">
        <div>
          <p className="criteria-panel__kicker">Investment criteria</p>
          <h3 id="criteria-title">Define what deserves attention</h3>
        </div>
        <p>Your changes stay on this page for now. Scoring comes next.</p>
      </div>

      <div className="criteria-fields">
        <fieldset className="criteria-budget">
          <legend>Purchase budget</legend>
          <label>
            <span>Minimum</span>
            <input type="number" inputMode="numeric" min="0" step="5000" value={minimumBudget} onChange={(event) => setMinimumBudget(Number(event.target.value))} />
            <small>{formatCriteriaCurrency(minimumBudget)}</small>
          </label>
          <label>
            <span>Maximum</span>
            <input type="number" inputMode="numeric" min="0" step="5000" value={maximumBudget} onChange={(event) => setMaximumBudget(Number(event.target.value))} />
            <small>{formatCriteriaCurrency(maximumBudget)}</small>
          </label>
        </fieldset>

        <label className="criteria-reserve">
          <span>Maximum improvement reserve</span>
          <input type="number" inputMode="numeric" min="0" step="5000" value={improvementReserve} onChange={(event) => setImprovementReserve(Number(event.target.value))} />
          <small>{formatCriteriaCurrency(improvementReserve)}</small>
        </label>
      </div>

      <fieldset className="criteria-mode">
        <legend>How should near-misses be treated?</legend>
        <div className="criteria-mode__choices">
          <label className={mode === "strict" ? "is-selected" : ""}>
            <input type="radio" name="attention-mode" value="strict" checked={mode === "strict"} onChange={() => setMode("strict")} />
            <span><strong>Strict</strong><small>Over-limit listings will be excluded when scoring is added.</small></span>
          </label>
          <label className={mode === "flexible" ? "is-selected" : ""}>
            <input type="radio" name="attention-mode" value="flexible" checked={mode === "flexible"} onChange={() => setMode("flexible")} />
            <span><strong>Flexible</strong><small>Near-misses will stay with a score penalty when scoring is added.</small></span>
          </label>
        </div>
      </fieldset>
    </section>
  );
}
