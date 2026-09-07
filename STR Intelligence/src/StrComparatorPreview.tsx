import React from "react";
import type { StrComparisonDto } from "./str-comparator-client.js";

type Props = Readonly<{
  comparison: StrComparisonDto;
  propertyLabel: string;
  detailsButtonId?: string;
  onSeeDetails(): void;
}>;

export function StrComparatorPreview({ comparison, propertyLabel, detailsButtonId, onSeeDetails }: Props) {
  const candidates = comparison.candidates.slice(0, 5);
  const radiusMiles = comparison.radiusMiles ?? 1;

  return (
    <details className="str-preview" open>
      <summary className="str-preview__heading">
        <div>
          <strong>Nearby short-term rentals</strong>
          <span>{comparison.candidates.length} saved {comparison.candidates.length === 1 ? "match" : "matches"} within {radiusMiles} {radiusMiles === 1 ? "mile" : "miles"}</span>
        </div>
      </summary>
      <div className="str-preview__body" aria-label={`Nearby short-term rentals for ${propertyLabel}`}>
        {candidates.length ? (
          <ol className="str-preview__list">
            {candidates.map((candidate, index) => (
              <li key={candidate.providerListingKey ?? candidate.listingUrl}>
                {candidate.imageUrl ? (
                  <img src={candidate.imageUrl} alt="" loading="lazy" />
                ) : (
                  <span className="str-preview__image-fallback" aria-hidden="true">⌂</span>
                )}
                <span className="str-preview__rank">{index + 1}</span>
                <a href={candidate.listingUrl} target="_blank" rel="noreferrer">
                  {candidate.title ?? `Comparable stay ${index + 1}`}
                </a>
              </li>
            ))}
          </ol>
        ) : (
          <p className="str-preview__empty">No eligible nearby stays were found.</p>
        )}
        {candidates.length > 0 && (
          <button id={detailsButtonId} className="str-preview__details" type="button" onClick={onSeeDetails}>
            See comparison details <span aria-hidden="true">→</span>
          </button>
        )}
      </div>
    </details>
  );
}
