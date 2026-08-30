import React, { useEffect, useState } from "react";
import {
  DEFAULT_INVESTMENT_CRITERIA,
  formatCriteriaCurrency,
  validateInvestmentCriteria,
  type InvestmentCriteria,
  type AttentionMode,
} from "../shared/investment-criteria";
import {
  investmentCriteriaClient,
  type InvestmentCriteriaClient,
} from "./investment-criteria-client";

type InvestmentCriteriaPanelProps = Readonly<{
  client?: InvestmentCriteriaClient;
  isApplying?: boolean;
  onApply?: (criteria: InvestmentCriteria) => Promise<void>;
}>;

export function InvestmentCriteriaPanel({
  client = investmentCriteriaClient,
  isApplying = false,
  onApply,
}: InvestmentCriteriaPanelProps) {
  const [minimumBudget, setMinimumBudget] = useState<number>(DEFAULT_INVESTMENT_CRITERIA.minimumPurchaseBudgetUsd);
  const [maximumBudget, setMaximumBudget] = useState<number>(DEFAULT_INVESTMENT_CRITERIA.maximumPurchaseBudgetUsd);
  const [improvementReserve, setImprovementReserve] = useState<number>(DEFAULT_INVESTMENT_CRITERIA.maximumImprovementReserveUsd);
  const [mode, setMode] = useState<AttentionMode>(DEFAULT_INVESTMENT_CRITERIA.mode);
  const [saveState, setSaveState] = useState<"idle" | "loading" | "saving" | "saved" | "error">("loading");
  const [feedback, setFeedback] = useState("");

  useEffect(() => {
    let active = true;
    client.load().then((criteria) => {
      if (!active) return;
      setMinimumBudget(criteria.minimumPurchaseBudgetUsd);
      setMaximumBudget(criteria.maximumPurchaseBudgetUsd);
      setImprovementReserve(criteria.maximumImprovementReserveUsd);
      setMode(criteria.mode);
      setSaveState("idle");
    }).catch(() => {
      if (!active) return;
      setSaveState("error");
      setFeedback("Saved defaults could not be loaded. You can still edit these values.");
    });
    return () => { active = false; };
  }, [client]);

  async function saveDefaults() {
    const result = currentCriteria();
    if (!result.ok) {
      setSaveState("error");
      setFeedback(result.errors[0]?.message ?? "Check the investment criteria values.");
      return;
    }
    setSaveState("saving");
    setFeedback("");
    try {
      await client.save(result.value);
      setSaveState("saved");
      setFeedback("Defaults saved.");
    } catch (error) {
      setSaveState("error");
      setFeedback(error instanceof Error ? error.message : "Defaults could not be saved.");
    }
  }

  async function applyCriteria() {
    const result = currentCriteria();
    if (!result.ok) {
      setSaveState("error");
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
      minimumPurchaseBudgetUsd: minimumBudget,
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
        <button type="button" onClick={saveDefaults} disabled={saveState === "loading" || saveState === "saving"}>
          {saveState === "saving" ? "Saving…" : "Save defaults"}
        </button>
        {feedback && <p className={saveState === "error" ? "criteria-feedback is-error" : "criteria-feedback"} role={saveState === "error" ? "alert" : "status"}>{feedback}</p>}
      </div>
    </section>
  );
}
