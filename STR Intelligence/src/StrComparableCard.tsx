import React from "react";
import type { StrComparableDto } from "./str-comparator-client.js";
import { formatBedroomBathroomCount, formatComparatorCurrency, formatComparatorDistance, formatComparatorPercent } from "./str-comparator-format.js";

export function StrComparableCard({ candidate, rank, context }: Readonly<{
  candidate: StrComparableDto;
  rank: number;
  context?: string;
}>) {
  return <article className="str-comparator__comparable" onClick={(event) => openListingFromCard(event, candidate.listingUrl)}>
    {candidate.imageUrl ? <img className="str-comparator__card-image" src={candidate.imageUrl} alt={`Stay at ${candidate.title ?? "comparable property"}`} loading="lazy" /> : <div className="str-comparator__card-image str-comparator__card-image--fallback" role="img" aria-label="Stay image unavailable">⌂</div>}
    <div className="str-comparator__identity">
      <div className="str-comparator__card-top"><span className="str-comparator__rank">#{rank}</span>{candidate.isSuperhost && <span className="str-comparator__superhost">Superhost</span>}</div>
      <div className="str-comparator__title-row"><h3><a href={candidate.listingUrl} target="_blank" rel="noreferrer">{candidate.title ?? `Comparable ${rank}`}</a></h3></div>
      <p className="str-comparator__home-facts">{[candidate.roomType ?? candidate.propertyType ?? "Entire home", formatBedroomBathroomCount(candidate.bedrooms, "bedroom"), formatBedroomBathroomCount(candidate.bathrooms, "bathroom")].filter(Boolean).join(" · ")}</p>
      <dl className="str-comparator__quick-facts">
        <div><dt>Distance</dt><dd>{credibleDistance(candidate.distanceMiles)}</dd></div>
        <div><dt>Guests</dt><dd>{candidate.guestCapacity ? `Sleeps ${candidate.guestCapacity}` : "Not listed"}</dd></div>
        <div><dt>Rating</dt><dd>{candidate.rating ? `★ ${candidate.rating.toFixed(2)}${candidate.reviewCount !== undefined ? ` (${candidate.reviewCount})` : ""}` : "Not rated"}</dd></div>
      </dl>
      {context && <p className="str-comparator__context">{context}</p>}
      <details className="str-comparator__details"><summary>Why this match</summary><p>{candidate.matchReasons.length ? candidate.matchReasons.join(" · ") : "Ranked by distance and property similarity."}</p></details>
    </div>
    <aside className="str-comparator__evidence">
      <div className="str-comparator__current-rate"><span>Current rate</span><strong>{formatComparatorCurrency(candidate.observedNightlyPriceUsd)}<small>/night</small></strong></div>
      {hasCalendarMetric(candidate) && <div className="str-comparator__booking-metric"><span>Booked or blocked</span><strong>{formatComparatorPercent(candidate.calendarUnavailablePercentage)}</strong><small>Based on {candidate.calendarObservationCount} observed calendar nights</small></div>}
    </aside>
  </article>;
}

function openListingFromCard(event: React.MouseEvent<HTMLElement>, listingUrl: string) {
  if ((event.target as HTMLElement).closest("a, button, input, label, summary, details")) return;
  window.open(listingUrl, "_blank", "noopener,noreferrer");
}

function credibleDistance(distanceMiles: number) {
  return Number.isFinite(distanceMiles) && distanceMiles >= 0 && distanceMiles <= 100 ? formatComparatorDistance(distanceMiles) : "Unavailable";
}

function hasCalendarMetric(candidate: StrComparableDto) {
  return candidate.calendarUnavailablePercentage !== undefined
    && Number.isFinite(candidate.calendarUnavailablePercentage)
    && candidate.calendarUnavailableNights !== undefined
    && candidate.calendarUnavailableNights >= 0
    && candidate.calendarObservationCount !== undefined
    && candidate.calendarObservationCount > 0;
}
