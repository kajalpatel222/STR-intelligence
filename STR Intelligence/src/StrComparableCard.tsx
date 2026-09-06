import React, { useState } from "react";
import type { CalendarWindowDays, StrComparableDto } from "./str-comparator-client.js";
import { formatBedroomBathroomCount, formatComparatorCurrency, formatComparatorDate, formatComparatorPercent } from "./str-comparator-format.js";

export function StrComparableCard({ candidate, rank, context, footer, onRefreshCalendar }: Readonly<{
  candidate: StrComparableDto;
  rank: number;
  context?: string;
  footer?: React.ReactNode;
  onRefreshCalendar?: () => Promise<void>;
}>) {
  const [calendarWindowDays, setCalendarWindowDays] = useState<CalendarWindowDays>(15);
  const [refreshStatus, setRefreshStatus] = useState<"idle" | "refreshing" | "error">("idle");
  const calendarMetric = candidate.calendarWindows?.find((item) => item.days === calendarWindowDays);
  async function refreshCalendar(event: React.MouseEvent<HTMLButtonElement>) {
    event.stopPropagation();
    if (!onRefreshCalendar || refreshStatus === "refreshing") return;
    setRefreshStatus("refreshing");
    try { await onRefreshCalendar(); setRefreshStatus("idle"); } catch { setRefreshStatus("error"); }
  }
  return <article className="str-comparator__comparable" onClick={(event) => openListingFromCard(event, candidate.listingUrl)}>
    {candidate.imageUrl ? <img className="str-comparator__card-image" src={candidate.imageUrl} alt={`Stay at ${candidate.title ?? "comparable property"}`} loading="lazy" /> : <div className="str-comparator__card-image str-comparator__card-image--fallback" role="img" aria-label="Stay image unavailable">⌂</div>}
    <div className="str-comparator__identity">
      <div className="str-comparator__card-top"><span className="str-comparator__rank">#{rank}</span>{candidate.isSuperhost && <span className="str-comparator__superhost">Superhost</span>}</div>
      <div className="str-comparator__title-row"><h3><a href={candidate.listingUrl} target="_blank" rel="noreferrer">{candidate.title ?? `Comparable ${rank}`}</a></h3></div>
      <p className="str-comparator__home-facts">{[candidate.roomType ?? candidate.propertyType ?? "Entire home", formatBedroomBathroomCount(candidate.bedrooms, "bedroom"), formatBedroomBathroomCount(candidate.bathrooms, "bathroom")].filter(Boolean).join(" · ")}</p>
      <dl className="str-comparator__quick-facts">
        <div><dt>Current rate</dt><dd>{formatComparatorCurrency(candidate.observedNightlyPriceUsd)}<small>/night</small></dd></div>
        <div><dt>Guests</dt><dd>{candidate.guestCapacity ? `Sleeps ${candidate.guestCapacity}` : "Not listed"}</dd></div>
        <div><dt>Rating</dt><dd>{candidate.rating ? `★ ${candidate.rating.toFixed(2)}${candidate.reviewCount !== undefined ? ` (${candidate.reviewCount})` : ""}` : "Not rated"}</dd></div>
      </dl>
      {context && <p className="str-comparator__context">{context}</p>}
      <div className="str-comparator__calendar-control">
        <div className="str-comparator__calendar-row">
          {calendarMetric ? <div className="str-comparator__booking-metric"><span>Booked or blocked</span><strong>{formatComparatorPercent(calendarMetric.unavailablePercentage)}</strong><small>Based on {calendarMetric.observationCount} nights</small></div> : <p className="str-comparator__calendar-empty">Not enough calendar data for this window.</p>}
          <CalendarWindowSelect id={`calendar-window-${rank}-${safeId(candidate.listingUrl)}`} value={calendarWindowDays} onChange={setCalendarWindowDays} />
        </div>
        <div className="str-comparator__calendar-meta"><small>{candidate.calendarObservedAt ? `Checked ${formatComparatorDate(candidate.calendarObservedAt)}` : "No collection date"}</small>{onRefreshCalendar && <button type="button" onClick={refreshCalendar} disabled={refreshStatus === "refreshing"}>{refreshStatus === "refreshing" ? "Refreshing…" : "Refresh"}</button>}</div>
        {refreshStatus === "error" && <p className="str-comparator__calendar-error" role="alert">Calendar could not be refreshed. Saved data is unchanged.</p>}
      </div>
      <details className="str-comparator__details"><summary>Why this match</summary><p>{candidate.matchReasons.length ? candidate.matchReasons.join(" · ") : "Ranked by distance and property similarity."}</p></details>
      {footer}
    </div>
  </article>;
}

function openListingFromCard(event: React.MouseEvent<HTMLElement>, listingUrl: string) {
  if ((event.target as HTMLElement).closest("a, button, input, label, summary, details")) return;
  window.open(listingUrl, "_blank", "noopener,noreferrer");
}

export function CalendarWindowSelect({ value, onChange, id }: Readonly<{ value: CalendarWindowDays; onChange(value: CalendarWindowDays): void; id: string }>) {
  return <fieldset className="str-comparator__window-select"><legend>Calendar window</legend>{[15, 30, 45, 60, 90].map((days) => <label key={days}><input id={days === 15 ? id : undefined} type="radio" name={id} value={days} checked={value === days} onChange={() => onChange(days as CalendarWindowDays)} /><span>{days}d</span></label>)}</fieldset>;
}
function safeId(value: string) { return value.replace(/[^a-z0-9]+/gi, "-").slice(-24); }
