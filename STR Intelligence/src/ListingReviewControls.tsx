import React from "react";
import type { ListingReviewDecision } from "../shared/listing-review";
export type { ListingReviewDecision } from "../shared/listing-review";

type ListingReviewControlsProps = Readonly<{
  propertyLabel: string;
  groupName: string;
  decision?: ListingReviewDecision;
  isSaving?: boolean;
  feedback?: string;
  onDecision(decision: ListingReviewDecision): void;
}>;

const DECISIONS: ReadonlyArray<Readonly<{ value: ListingReviewDecision; label: string }>> = [
  { value: "promote", label: "Promote" },
  { value: "hold", label: "Hold" },
  { value: "dismiss", label: "Dismiss" },
];

export function ListingReviewControls({ propertyLabel, groupName, decision, isSaving = false, feedback, onDecision }: ListingReviewControlsProps) {
  return (
    <fieldset className="listing-review">
      <legend>Your decision <span>for {propertyLabel}</span></legend>
      <div className="listing-review__choices">
        {DECISIONS.map((option) => (
          <label key={option.value} className={decision === option.value ? `is-selected is-${option.value}` : ""}>
            <input type="radio" name={groupName} value={option.value} checked={decision === option.value} disabled={isSaving} onChange={() => onDecision(option.value)} />
            <span>{option.label}</span>
          </label>
        ))}
      </div>
      {feedback && <p className="listing-review__feedback" role="status">{feedback}</p>}
    </fieldset>
  );
}
