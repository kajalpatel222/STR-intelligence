import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { formatLandArea } from "./listing-format";
import { InvestmentCriteriaPanel } from "./InvestmentCriteriaPanel";
import type { PublicAttentionEvaluation } from "../shared/attention-api";
import type { InvestmentCriteria } from "../shared/investment-criteria";
import { evaluateCurrentListings } from "./attention-client";
import { ListingReviewControls, type ListingReviewDecision } from "./ListingReviewControls";
import { loadListingReviews, saveListingReview } from "./listing-review-client";
import { StrComparatorWorkspace } from "./StrComparatorWorkspace";
import { StrComparatorPreview } from "./StrComparatorPreview";
import { strComparatorClient, type StrComparisonDto } from "./str-comparator-client";

type PropertyIntent = "homes" | "land";
const SUPPORTED_LOCATIONS = ["Oakhurst, CA", "Mariposa, CA"] as const;
type SupportedLocation = (typeof SUPPORTED_LOCATIONS)[number];

type SearchRequestDraft = {
  source: "zillow_existing_home" | "zillow_land";
  location: SupportedLocation;
  lookbackDays: 7;
  recordLimit: 5;
  filters: Record<string, never>;
};

type PublicListing = {
  title?: string;
  address?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  price?: number;
  beds?: number;
  baths?: number;
  sqft?: number;
  lotSqft?: number;
  lotAcres?: number;
  imageUrl?: string;
  propertyType?: string;
  zoningText?: string;
  description?: string;
  amenities?: string[];
  statusText?: string;
  url?: string;
};

type SearchOutcome = { status: string; message: string; listingCount?: number; listings?: PublicListing[] };

export default function App() {
  const [message, setMessage] = useState("");
  const [location, setLocation] = useState<string>("Oakhurst, CA");
  const [isLocationOpen, setIsLocationOpen] = useState(false);
  const [activeLocationIndex, setActiveLocationIndex] = useState(0);
  const [selectedIntent, setSelectedIntent] = useState<PropertyIntent | null>(null);
  const [searchRequest, setSearchRequest] = useState<SearchRequestDraft | null>(null);
  const [intentError, setIntentError] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [searchOutcome, setSearchOutcome] = useState<SearchOutcome | null>(null);
  const [attentionEvaluations, setAttentionEvaluations] = useState<PublicAttentionEvaluation[]>([]);
  const [isApplyingCriteria, setIsApplyingCriteria] = useState(false);
  const [listingReviews, setListingReviews] = useState<Record<number, ListingReviewDecision>>({});
  const [reviewSaveStates, setReviewSaveStates] = useState<Record<number, "saving" | "saved" | "error">>({});
  const [comparatorListingIndex, setComparatorListingIndex] = useState<number | null>(null);
  const [comparisons, setComparisons] = useState<Record<number, StrComparisonDto>>({});
  const [comparisonLoadingIndex, setComparisonLoadingIndex] = useState<number | null>(null);
  const [comparisonErrors, setComparisonErrors] = useState<Record<number, string>>({});
  const returnFocusIndex = useRef<number | null>(null);
  const filteredLocations = SUPPORTED_LOCATIONS.filter((option) => option.toLowerCase().includes(location.toLowerCase()));
  const orderedListingIndexes = rankListingIndexes(searchOutcome?.listings?.length ?? 0, attentionEvaluations);

  useEffect(() => {
    if (comparatorListingIndex === null && returnFocusIndex.current !== null) {
      const index = returnFocusIndex.current;
      document.getElementById(comparisons[index] ? `comparison-details-${index}` : `compare-str-${index}`)?.focus();
      returnFocusIndex.current = null;
    }
  }, [comparatorListingIndex, comparisons]);

  if (comparatorListingIndex !== null) {
    const listing = searchOutcome?.listings?.[comparatorListingIndex];
    if (listing?.url) return <StrComparatorWorkspace listingUrl={listing.url} propertyLabel={listing.address ?? listing.title} initialComparison={comparisons[comparatorListingIndex]} onBack={() => setComparatorListingIndex(null)} />;
  }

  function chooseLocation(option: SupportedLocation) {
    setLocation(option);
    setIsLocationOpen(false);
    setActiveLocationIndex(0);
    setIntentError("");
  }

  function handleLocationKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setIsLocationOpen(true);
      setActiveLocationIndex((index) => Math.min(index + 1, Math.max(filteredLocations.length - 1, 0)));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveLocationIndex((index) => Math.max(index - 1, 0));
    } else if (event.key === "Enter" && isLocationOpen && filteredLocations[activeLocationIndex]) {
      event.preventDefault();
      chooseLocation(filteredLocations[activeLocationIndex]);
    } else if (event.key === "Escape") {
      setIsLocationOpen(false);
    }
  }

  function chooseIntent(intent: PropertyIntent) {
    setSelectedIntent(intent);
    setIntentError("");
    const submittedIntent = searchRequest?.source === "zillow_land" ? "land" : searchRequest ? "homes" : null;
    if (submittedIntent && submittedIntent !== intent) {
      setSearchRequest(null);
      setSearchOutcome(null);
      setAttentionEvaluations([]);
      setListingReviews({});
      setReviewSaveStates({});
      setComparatorListingIndex(null);
      setComparisons({});
      setComparisonErrors({});
    }
  }

  function updateMessage(nextMessage: string) {
    setMessage(nextMessage);
    const explicitIntent = inferPropertyIntent(nextMessage);
    if (explicitIntent) chooseIntent(explicitIntent);
  }

  async function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const propertyType = inferPropertyIntent(message) ?? selectedIntent;

    if (!propertyType) {
      setSearchRequest(null);
      setIntentError("Choose Homes or Land, or mention one in your message.");
      return;
    }
    if (!SUPPORTED_LOCATIONS.includes(location as SupportedLocation)) {
      setIntentError("Choose Oakhurst, CA or Mariposa, CA from the location list.");
      return;
    }

    setSelectedIntent(propertyType);
    setIntentError("");
    const request: SearchRequestDraft = {
      source: propertyType === "homes" ? "zillow_existing_home" : "zillow_land",
      location: location as SupportedLocation,
      lookbackDays: 7,
      recordLimit: 5,
      filters: {},
    };
    setSearchRequest(request);
    setSearchOutcome(null);
    setAttentionEvaluations([]);
    setListingReviews({});
    setReviewSaveStates({});
    setComparatorListingIndex(null);
    setComparisons({});
    setComparisonErrors({});
    setIsSearching(true);

    try {
      const response = await fetch("/api/property-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ propertyType, location: request.location }),
      });
      const outcome = await response.json() as SearchOutcome;
      setSearchOutcome(outcome);
      const listingUrls = (outcome.listings ?? []).flatMap((listing) => listing.url ? [listing.url] : []);
      if (propertyType === "homes" && listingUrls.length) {
        try {
          const savedReviews = await loadListingReviews(listingUrls);
          const decisions: Record<number, ListingReviewDecision> = {};
          (outcome.listings ?? []).forEach((listing, index) => {
            const saved = savedReviews.find((review) => review.listingUrl === listing.url);
            if (saved) decisions[index] = saved.decision;
          });
          setListingReviews(decisions);
          setReviewSaveStates(Object.fromEntries(Object.keys(decisions).map((index) => [Number(index), "saved"])));
        } catch {
          setReviewSaveStates({});
        }
      }
    } catch {
      setSearchOutcome({ status: "unavailable", message: "Property search is temporarily unavailable. Please try again later." });
    } finally {
      setIsSearching(false);
    }
  }

  async function applyCriteria(criteria: InvestmentCriteria) {
    const listings = searchOutcome?.listings ?? [];
    if (!listings.length) return;
    setIsApplyingCriteria(true);
    try {
      setAttentionEvaluations(await evaluateCurrentListings(criteria, listings));
    } finally {
      setIsApplyingCriteria(false);
    }
  }

  async function updateListingReview(index: number, decision: ListingReviewDecision) {
    const listingUrl = searchOutcome?.listings?.[index]?.url;
    if (!listingUrl) return;
    const priorDecision = listingReviews[index];
    setListingReviews((reviews) => ({ ...reviews, [index]: decision }));
    setReviewSaveStates((states) => ({ ...states, [index]: "saving" }));
    try {
      await saveListingReview(listingUrl, decision);
      setReviewSaveStates((states) => ({ ...states, [index]: "saved" }));
    } catch {
      setListingReviews((reviews) => {
        const next = { ...reviews };
        if (priorDecision) next[index] = priorDecision;
        else delete next[index];
        return next;
      });
      setReviewSaveStates((states) => ({ ...states, [index]: "error" }));
    }
  }

  async function findComparables(index: number) {
    const listing = searchOutcome?.listings?.[index];
    if (!listing?.url || comparisonLoadingIndex !== null) return;
    setComparisonLoadingIndex(index);
    setComparisonErrors((errors) => ({ ...errors, [index]: "" }));
    try {
      const comparison = await strComparatorClient.discover(listing.url);
      setComparisons((current) => ({ ...current, [index]: comparison }));
    } catch {
      setComparisonErrors((errors) => ({ ...errors, [index]: "We could not find nearby stays. Please try again." }));
    } finally {
      setComparisonLoadingIndex(null);
    }
  }

  return (
    <main className="app-shell product-home">
      <header className="site-header">
        <a className="brand" href="#top" aria-label="STR Intelligence home">
          <span className="brand-mark">SI</span>
          <span>STR Intelligence</span>
        </a>
        <span className="market-label">Property intelligence for thoughtful investors</span>
      </header>

      <section className="product-hero" id="top">
        <p className="eyebrow">Find your next opportunity</p>
        <h1>Start with the property you have in mind.</h1>
        <p>Explore homes and land through a simpler, more conversational search.</p>
      </section>

      <section className="search-preview search-preview--product" aria-labelledby="search-title">
        <div className="search-preview__intro">
          <p className="eyebrow">Property search</p>
          <h2 id="search-title">What are you looking for?</h2>
          <p>Tell us what you have in mind, or use a quick choice to get started.</p>
          <div className="search-guidance" aria-hidden="true">
            <span>“Show me homes in Oakhurst”</span>
            <span>“I’m looking for land in Oakhurst”</span>
          </div>
        </div>

        <div className="chat-card">
          <div className="assistant-message">
            <span className="assistant-avatar" aria-hidden="true">SI</span>
            <p>Are you looking for a home or land? You can include a location, too.</p>
          </div>

          <form className="search-form" onSubmit={submitSearch}>
            <fieldset>
              <legend>Property type</legend>
              <div className="intent-choices">
                <button type="button" disabled={isSearching} className={selectedIntent === "homes" ? "intent-choice is-selected" : "intent-choice"} aria-pressed={selectedIntent === "homes"} onClick={() => chooseIntent("homes")}>
                  <span className="intent-choice__icon" aria-hidden="true">⌂</span>
                  <span><strong>Homes</strong><small>Existing houses for sale</small></span>
                </button>
                <button type="button" disabled={isSearching} className={selectedIntent === "land" ? "intent-choice is-selected" : "intent-choice"} aria-pressed={selectedIntent === "land"} onClick={() => chooseIntent("land")}>
                  <span className="intent-choice__icon intent-choice__icon--land" aria-hidden="true">◇</span>
                  <span><strong>Land</strong><small>Lots and parcels</small></span>
                </button>
              </div>
            </fieldset>

            <label className="message-label" htmlFor="search-location">Location</label>
            <div className="location-combobox">
              <input className="location-input" id="search-location" role="combobox" aria-autocomplete="list" aria-expanded={isLocationOpen} aria-controls="supported-locations" aria-activedescendant={isLocationOpen && filteredLocations[activeLocationIndex] ? `location-${activeLocationIndex}` : undefined} disabled={isSearching} value={location} onFocus={() => setIsLocationOpen(true)} onBlur={() => setIsLocationOpen(false)} onKeyDown={handleLocationKeyDown} onChange={(event) => { setLocation(event.target.value); setActiveLocationIndex(0); setIsLocationOpen(true); setIntentError(""); }} autoComplete="off" />
              {isLocationOpen && <ul className="location-options" id="supported-locations" role="listbox">
                {filteredLocations.map((option, index) => <li id={`location-${index}`} role="option" aria-selected={index === activeLocationIndex} className={index === activeLocationIndex ? "is-active" : ""} key={option} onMouseDown={(event) => { event.preventDefault(); chooseLocation(option); }}>{option}</li>)}
                {filteredLocations.length === 0 && <li className="location-options__empty">No supported locations match.</li>}
              </ul>}
            </div>

            <label className="message-label" htmlFor="search-message">Describe your search</label>
            <div className="message-input-row">
              <input id="search-message" disabled={isSearching} value={message} onChange={(event) => updateMessage(event.target.value)} placeholder="I’m looking for homes in Oakhurst, CA" aria-describedby={intentError ? "intent-error" : undefined} />
              <button className="prepare-button" type="submit" disabled={isSearching}>{isSearching ? "Searching…" : "Continue"} {!isSearching && <span aria-hidden="true">→</span>}</button>
            </div>
            {intentError && <p className="form-error" id="intent-error" role="alert">{intentError}</p>}
          </form>

          {isSearching ? (
            <div className="assistant-response search-loading" role="status" aria-live="polite">
              <span className="loading-spinner" aria-hidden="true" />
              <div><strong>Searching for {selectedIntent === "land" ? "land" : "homes"} near {searchRequest?.location ?? location}…</strong><p>This can take a few minutes. Please keep this page open.</p></div>
            </div>
          ) : searchOutcome ? (
            <div className="assistant-response" role="status" aria-live="polite">
              <span className="assistant-avatar" aria-hidden="true">SI</span>
              <div>
                <strong>{searchOutcome.message}</strong>
                {searchRequest?.source === "zillow_existing_home" && Boolean(searchOutcome.listings?.length) && <InvestmentCriteriaPanel onApply={applyCriteria} isApplying={isApplyingCriteria} />}
                {orderedListingIndexes.map((index) => {
                  const listing = searchOutcome.listings![index]!;
                  const evaluation = attentionEvaluations.find((item) => item.listingIndex === index);
                  const propertyLabel = listing.address ?? listing.title ?? "this home";
                  const review = listingReviews[index];
                  return (
                  <article className="listing-result" key={`${listing.url ?? listing.address ?? "listing"}-${index}`}>
                    <div className="listing-result__layout">
                      {listing.imageUrl ? <img className="listing-result__image" src={listing.imageUrl} alt={`Property at ${listing.address ?? listing.title ?? "this listing"}`} loading="lazy" /> : <div className="listing-result__image listing-result__image--fallback" role="img" aria-label="Property image unavailable">⌂</div>}
                      <div className="listing-result__content">
                        <div className="listing-result__header"><div><h3>{listing.title ?? listing.address ?? (searchRequest?.source === "zillow_land" ? "Land for sale" : "Home for sale")}</h3><p>{[listing.city, listing.state, listing.postalCode].filter(Boolean).join(", ")}</p>{evaluation && <span className={`priority-badge priority-badge--${evaluation.priority.band}`}>{formatPriorityBand(evaluation.priority.band)}</span>}</div><div className="listing-result__price-stack"><div className="listing-result__price-row">{listing.price !== undefined && <strong className="listing-result__price">{formatPrice(listing.price)}</strong>}{listing.url && <SourceListingLink url={listing.url} propertyLabel={propertyLabel} />}</div>{evaluation && <div className="listing-result__scores" aria-label="Property evaluation scores"><span className="score-tag"><strong>{formatScore(evaluation.result.attentionScore)}</strong><small>Attention Score</small></span><span className="score-tag score-tag--confidence"><strong>{formatScore(evaluation.result.confidenceScore)}</strong><small>Confidence Score</small></span></div>}</div></div>
                    {(listing.propertyType || listing.zoningText) && <p className="listing-result__descriptor">{[listing.propertyType, listing.zoningText].filter(Boolean).join(" · ")}</p>}
                    <dl>
                      {searchRequest?.source !== "zillow_land" && listing.beds !== undefined && <div><dt>Beds</dt><dd>{listing.beds}</dd></div>}
                      {searchRequest?.source !== "zillow_land" && listing.baths !== undefined && <div><dt>Baths</dt><dd>{listing.baths}</dd></div>}
                      {searchRequest?.source !== "zillow_land" && listing.sqft !== undefined && <div><dt>Living area</dt><dd>{listing.sqft.toLocaleString()} sq ft</dd></div>}
                      {searchRequest?.source === "zillow_land" ? (
                        formatLandArea(listing) && <div><dt>Parcel size</dt><dd>{formatLandArea(listing)}</dd></div>
                      ) : listing.lotSqft !== undefined && listing.lotSqft > 0 && <div><dt>Lot area</dt><dd>{formatLotArea(listing.lotSqft)}</dd></div>}
                    </dl>
                    {evaluation && <details className="listing-insights"><summary>Why this ranking</summary><div><p>{evaluation.priority.reason}</p>{evaluation.explanation.positiveDrivers.slice(0, 2).map((reason) => <p key={reason}>{reason}</p>)}{evaluation.explanation.concerns.slice(0, 2).map((reason) => <p key={reason} className="is-concern">{reason}</p>)}{evaluation.explanation.missingEvidence.slice(0, 2).map((reason) => <p key={reason} className="is-missing">{reason}</p>)}</div></details>}
                    {evaluation && <ListingReviewControls propertyLabel={propertyLabel} groupName={`review-${index}`} decision={review} isSaving={reviewSaveStates[index] === "saving"} feedback={reviewSaveStates[index] === "saving" ? "Saving…" : reviewSaveStates[index] === "error" ? "Decision could not be saved. Try again." : undefined} onDecision={(decision) => void updateListingReview(index, decision)} />}
                    {evaluation && canOpenStrComparator(review, reviewSaveStates[index]) && !comparisons[index] && <button id={`compare-str-${index}`} className="compare-str-button" type="button" disabled={comparisonLoadingIndex !== null} onClick={() => void findComparables(index)}>{comparisonLoadingIndex === index ? "Finding nearby STRs…" : "Compare with nearby STRs"} <span aria-hidden="true">→</span></button>}
                    {comparisonErrors[index] && <p className="comparison-inline-error" role="alert">{comparisonErrors[index]}</p>}
                    {comparisons[index] && <StrComparatorPreview comparison={comparisons[index]} propertyLabel={propertyLabel} detailsButtonId={`comparison-details-${index}`} onSeeDetails={() => { returnFocusIndex.current = index; setComparatorListingIndex(index); }} />}
                      </div>
                    </div>
                  </article>
                )})}
              </div>
            </div>
          ) : (
            <div className="search-empty-state">
              <span aria-hidden="true">⌁</span>
              <p>Your property search will appear here.</p>
            </div>
          )}
        </div>
      </section>

      <footer className="product-footer">
        <span>STR Intelligence</span>
        <span>Homes and land, considered side by side.</span>
      </footer>
    </main>
  );
}

function SourceListingLink({ url, propertyLabel }: Readonly<{ url: string; propertyLabel: string }>) {
  return <a className="listing-result__source-link" href={url} target="_blank" rel="noreferrer" aria-label={`Open Zillow listing for ${propertyLabel}`}>
    <svg aria-hidden="true" viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10 13a5 5 0 0 0 7.1.1l2-2a5 5 0 0 0-7.1-7.1l-1.1 1.1"/><path d="M14 11a5 5 0 0 0-7.1-.1l-2 2A5 5 0 0 0 12 20l1.1-1.1"/></svg>
  </a>;
}

function inferPropertyIntent(message: string): PropertyIntent | null {
  const hasHome = /\b(home|homes|house|houses)\b/i.test(message);
  const hasLand = /\b(land|lot|lots|parcel|parcels)\b/i.test(message);
  if (hasHome === hasLand) return null;
  return hasHome ? "homes" : "land";
}

function formatPrice(price: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(price);
}

function formatLotArea(lotSqft: number) {
  return lotSqft >= 43_560 ? `${(lotSqft / 43_560).toFixed(2)} acres` : `${lotSqft.toLocaleString()} sq ft`;
}

function formatScore(score: number | null) {
  return score === null ? "—" : Math.round(score).toString();
}

function formatPriorityBand(band: PublicAttentionEvaluation["priority"]["band"]) {
  return { review_now: "Review now", promising: "Promising", low_priority: "Low priority", ineligible: "Ineligible" }[band];
}

export function rankListingIndexes(listingCount: number, evaluations: readonly PublicAttentionEvaluation[]) {
  const indexes = Array.from({ length: listingCount }, (_, index) => index);
  if (evaluations.length === 0) return indexes;
  const byIndex = new Map(evaluations.map((evaluation) => [evaluation.listingIndex, evaluation]));
  return indexes.sort((left, right) => {
    const leftEvaluation = byIndex.get(left);
    const rightEvaluation = byIndex.get(right);
    const attentionDifference = scoreForSort(rightEvaluation?.result.attentionScore) - scoreForSort(leftEvaluation?.result.attentionScore);
    if (attentionDifference !== 0) return attentionDifference;
    const confidenceDifference = scoreForSort(rightEvaluation?.result.confidenceScore) - scoreForSort(leftEvaluation?.result.confidenceScore);
    return confidenceDifference !== 0 ? confidenceDifference : left - right;
  });
}

function scoreForSort(score: number | null | undefined) {
  return typeof score === "number" && Number.isFinite(score) ? score : -1;
}

export function canOpenStrComparator(decision: ListingReviewDecision | undefined, saveState: "saving" | "saved" | "error" | undefined) {
  return decision === "promote" && saveState === "saved";
}
