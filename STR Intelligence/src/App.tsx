import React, { useEffect, useRef, useState, type FormEvent } from "react";
import { formatLandArea } from "./listing-format";
import { InvestmentCriteriaPanel } from "./InvestmentCriteriaPanel";
import type { PublicAttentionEvaluation } from "../shared/attention-api";
import type { InvestmentCriteria } from "../shared/investment-criteria";
import { evaluateCurrentListings } from "./attention-client";
import { StrComparatorWorkspace } from "./StrComparatorWorkspace";
import { StrComparatorPreview } from "./StrComparatorPreview";
import { strComparatorClient, type StrComparisonDto } from "./str-comparator-client";
import { StrComparableLibrary } from "./StrComparableLibrary";
import { ProductHeader, type ProductView } from "./ProductHeader";
import { FinancialAnalysisWorkspace } from "./FinancialAnalysisWorkspace";
import { FinancialDashboard } from "./FinancialDashboard";
import { parsePropertySearchQuery, type PropertySearchQueryResult } from "../shared/property-search-query";
import { validateZillowListingUrl } from "../shared/zillow-listing-url";
import { MarketListings } from "./MarketListings";

type PropertyIntent = "homes" | "land";
const SUPPORTED_LOCATIONS = ["Oakhurst, CA", "Mariposa, CA"] as const;
type SupportedLocation = (typeof SUPPORTED_LOCATIONS)[number];

type SearchRequestDraft = {
  source: "zillow_existing_home" | "zillow_land";
  location: SupportedLocation;
  lookbackDays: 7;
  recordLimit: 1 | 5;
  filters: Readonly<{ maximumPriceUsd?: number; minimumBedrooms?: number }>;
  originalQuery: string;
  mode?: "search" | "direct";
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
  const [activeView, setActiveView] = useState<ProductView>("search");
  const [message, setMessage] = useState("");
  const [listingUrl, setListingUrl] = useState("");
  const [listingUrlError, setListingUrlError] = useState("");
  const [searchRequest, setSearchRequest] = useState<SearchRequestDraft | null>(null);
  const [intentError, setIntentError] = useState("");
  const [isEditingSearch, setIsEditingSearch] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [searchOutcome, setSearchOutcome] = useState<SearchOutcome | null>(null);
  const [attentionEvaluations, setAttentionEvaluations] = useState<PublicAttentionEvaluation[]>([]);
  const [isApplyingCriteria, setIsApplyingCriteria] = useState(false);
  const [comparatorListingIndex, setComparatorListingIndex] = useState<number | null>(null);
  const [comparisons, setComparisons] = useState<Record<number, StrComparisonDto>>({});
  const [comparisonLoadingIndex, setComparisonLoadingIndex] = useState<number | null>(null);
  const [comparisonErrors, setComparisonErrors] = useState<Record<number, string>>({});
  const [financialListingIndex, setFinancialListingIndex] = useState<number | null>(null);
  const returnFocusIndex = useRef<number | null>(null);
  const financialReturnFocusIndex = useRef<number | null>(null);
  const parsedPreview = message.trim() ? parsePropertySearchQuery(message) : null;
  const orderedListingIndexes = rankListingIndexes(searchOutcome?.listings?.length ?? 0, attentionEvaluations);

  useEffect(() => {
    if (comparatorListingIndex === null && returnFocusIndex.current !== null) {
      const index = returnFocusIndex.current;
      document.getElementById(comparisons[index] ? `comparison-details-${index}` : `compare-str-${index}`)?.focus();
      returnFocusIndex.current = null;
    }
  }, [comparatorListingIndex, comparisons]);

  useEffect(() => {
    if (financialListingIndex === null && financialReturnFocusIndex.current !== null) {
      document.getElementById(`analyze-financials-${financialReturnFocusIndex.current}`)?.focus();
      financialReturnFocusIndex.current = null;
    }
  }, [financialListingIndex]);

  if (financialListingIndex !== null) {
    const listing = searchOutcome?.listings?.[financialListingIndex];
    if (listing && canAnalyzeListing(listing)) {
      return <FinancialAnalysisWorkspace
        listing={{
          title: listing.title ?? listing.address ?? "Home investment",
          address: listing.address,
          location: [listing.city, listing.state, listing.postalCode].filter(Boolean).join(", "),
          imageUrl: listing.imageUrl,
          priceUsd: listing.price,
          beds: listing.beds,
          baths: listing.baths,
          livingAreaSqft: listing.sqft,
          sourceUrl: listing.url,
        }}
        onBack={() => setFinancialListingIndex(null)}
      />;
    }
  }

  if (comparatorListingIndex !== null) {
    const listing = searchOutcome?.listings?.[comparatorListingIndex];
    if (listing?.url) return <StrComparatorWorkspace listingUrl={listing.url} propertyLabel={listing.address ?? listing.title} initialComparison={comparisons[comparatorListingIndex]} onBack={() => setComparatorListingIndex(null)} />;
  }

  if (activeView === "library") return <StrComparableLibrary onNavigate={setActiveView} />;
  if (activeView === "financials") return <FinancialDashboard onNavigate={setActiveView} />;
  if (activeView === "markets") return <MarketListings onNavigate={setActiveView} />;

  async function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = parsePropertySearchQuery(message);
    if (!parsed.ok || !parsed.request.propertyKind || !parsed.request.location) {
      setIntentError(parsed.issues[0]?.message ?? "Describe the Homes or Land search you want to run.");
      return;
    }
    const propertyType: PropertyIntent = parsed.request.propertyKind === "land" ? "land" : "homes";
    const requestLocation = `${parsed.request.location.city}, ${parsed.request.location.state}` as SupportedLocation;
    setIntentError("");
    const request: SearchRequestDraft = {
      source: propertyType === "homes" ? "zillow_existing_home" : "zillow_land",
      location: requestLocation,
      lookbackDays: 7,
      recordLimit: 5,
      filters: parsed.request.constraints,
      originalQuery: message.trim(),
    };
    setSearchRequest(request);
    setSearchOutcome(null);
    setAttentionEvaluations([]);
    setComparatorListingIndex(null);
    setFinancialListingIndex(null);
    setComparisons({});
    setComparisonErrors({});
    setIsSearching(true);
    setIsEditingSearch(false);

    try {
      const response = await fetch("/api/property-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: request.originalQuery }),
      });
      const outcome = await response.json() as SearchOutcome;
      setSearchOutcome(outcome);
    } catch {
      setSearchOutcome({ status: "unavailable", message: "Property search is temporarily unavailable. Please try again later." });
    } finally {
      setIsSearching(false);
    }
  }

  async function submitListingUrl(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const validation = validateZillowListingUrl(listingUrl);
    if ("message" in validation) { setListingUrlError(validation.message); return; }
    const request: SearchRequestDraft = { source: "zillow_existing_home", location: validation.location, lookbackDays: 7, recordLimit: 1, filters: {}, originalQuery: validation.url, mode: "direct" };
    setListingUrlError(""); setSearchRequest(request); setSearchOutcome(null); setAttentionEvaluations([]); setComparisons({}); setComparisonErrors({}); setIsSearching(true); setIsEditingSearch(false);
    try {
      const response = await fetch("/api/property-search", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ listingUrl: validation.url }) });
      setSearchOutcome(await response.json() as SearchOutcome);
    } catch {
      setSearchOutcome({ status: "unavailable", message: "That Zillow listing is temporarily unavailable. Please try again later." });
    } finally { setIsSearching(false); }
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
      <ProductHeader activeView="search" onNavigate={setActiveView} />

      <section className={`natural-search${searchRequest ? " natural-search--results" : ""}`} aria-labelledby="search-title">
        {!searchRequest ? <header className="natural-search__hero" id="top">
          <p className="eyebrow">Property search</p>
          <h1 id="search-title">Find your next STR investment</h1>
          <p>Describe the property you want. We’ll turn the essentials into a focused Zillow search.</p>
        </header> : <header className="results-search-header">
          <div><p className="eyebrow">Property results</p><h1 id="search-title">Properties matching your search</h1></div>
          <button type="button" onClick={() => setIsEditingSearch((value) => !value)} aria-expanded={isEditingSearch}>{isEditingSearch ? "Close editor" : "Edit search"}</button>
        </header>}

        {(!searchRequest || isEditingSearch) && <form className="natural-search-form" onSubmit={submitSearch}>
          <label htmlFor="search-message">Describe your property search</label>
          <div className="natural-search-form__row">
            <input id="search-message" disabled={isSearching} value={message} onChange={(event) => { setMessage(event.target.value); setIntentError(""); }} placeholder="3+ bedroom homes under $350k in Oakhurst" aria-describedby={[intentError ? "intent-error" : "", parsedPreview?.ok ? "parsed-search" : ""].filter(Boolean).join(" ") || undefined} autoComplete="off" />
            <button type="submit" disabled={isSearching || !message.trim()}>{isSearching ? "Searching…" : "Search properties"}</button>
          </div>
          {intentError && <p className="form-error" id="intent-error" role="alert">{intentError}</p>}
          {parsedPreview?.ok && <ParsedSearchChips parsed={parsedPreview} id="parsed-search" />}
          {!searchRequest && <div className="quick-searches" aria-label="Quick property searches">
            {QUICK_SEARCHES.map((query) => <button type="button" key={query} onClick={() => { setMessage(query); setIntentError(""); }}>{query}</button>)}
          </div>}
        </form>}

        {(!searchRequest || isEditingSearch) && <div className="direct-listing-entry">
          <div className="search-divider" aria-hidden="true"><span>or</span></div>
          <form onSubmit={submitListingUrl}>
            <label htmlFor="listing-url"><strong>Already have a listing in mind?</strong><span>Share its Zillow URL to review the property directly.</span></label>
            <div className="natural-search-form__row">
              <input id="listing-url" type="url" inputMode="url" disabled={isSearching} value={listingUrl} onChange={(event) => { setListingUrl(event.target.value); setListingUrlError(""); }} placeholder="https://www.zillow.com/homedetails/…" autoComplete="url" aria-describedby={listingUrlError ? "listing-url-error" : undefined} />
              <button type="submit" disabled={isSearching || !listingUrl.trim()}>{isSearching ? "Loading…" : "Review listing"}</button>
            </div>
            {listingUrlError && <p className="form-error" id="listing-url-error" role="alert">{listingUrlError}</p>}
          </form>
        </div>}

        {searchRequest && !isEditingSearch && <SearchRequestSummary request={searchRequest} />}

        <div className="property-results">

          {isSearching ? (
            <div className="assistant-response search-loading" role="status" aria-live="polite">
              <span className="loading-spinner" aria-hidden="true" />
              <div><strong>{searchRequest?.mode === "direct" ? "Loading your Zillow property…" : `Searching for ${searchRequest?.source === "zillow_land" ? "land" : "homes"} near ${searchRequest?.location}…`}</strong><p>This can take a few minutes. Please keep this page open.</p></div>
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
                    {searchRequest?.source === "zillow_existing_home" && <div className="listing-result__actions" aria-label={`Actions for ${propertyLabel}`}>
                      <button id={`analyze-financials-${index}`} className="listing-action listing-action--secondary" type="button" disabled={!canAnalyzeListing(listing)} onClick={() => { financialReturnFocusIndex.current = index; setFinancialListingIndex(index); }}>
                        {canAnalyzeListing(listing) ? "Analyze financials" : "Price required to analyze"}
                      </button>
                      {evaluation && !comparisons[index] && <button id={`compare-str-${index}`} className="listing-action listing-action--primary" type="button" disabled={comparisonLoadingIndex !== null} onClick={() => void findComparables(index)}>{comparisonLoadingIndex === index ? "Finding nearby STRs…" : "Compare nearby STRs"}</button>}
                    </div>}
                    {comparisonErrors[index] && <p className="comparison-inline-error" role="alert">{comparisonErrors[index]}</p>}
                    {comparisons[index] && <StrComparatorPreview comparison={comparisons[index]} propertyLabel={propertyLabel} detailsButtonId={`comparison-details-${index}`} onSeeDetails={() => { returnFocusIndex.current = index; setComparatorListingIndex(index); }} />}
                      </div>
                    </div>
                  </article>
                )})}
              </div>
            </div>
          ) : null}
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

export const QUICK_SEARCHES = [
  "3+ bedroom homes under $350k in Oakhurst",
  "Homes under $500k in Oakhurst",
  "Land under $200k in Mariposa",
] as const;

export function ParsedSearchChips({ parsed, id }: Readonly<{ parsed: PropertySearchQueryResult; id?: string }>) {
  if (!parsed.ok || !parsed.request.propertyKind || !parsed.request.location) return null;
  return <div className="parsed-search" id={id} role="status" aria-label="Search understood">
    <span>Search understood</span>
    <SearchChips request={{
      source: parsed.request.propertyKind === "land" ? "zillow_land" : "zillow_existing_home",
      location: `${parsed.request.location.city}, ${parsed.request.location.state}` as SupportedLocation,
      lookbackDays: 7,
      recordLimit: 5,
      filters: parsed.request.constraints,
      originalQuery: parsed.request.originalQuery,
    }} />
  </div>;
}

export function SearchRequestSummary({ request }: Readonly<{ request: SearchRequestDraft }>) {
  return <div className="search-request-summary" aria-label="Current property search">
    <SearchChips request={request} />
  </div>;
}

function SearchChips({ request }: Readonly<{ request: SearchRequestDraft }>) {
  return <div className="search-chips">
    <span>{request.source === "zillow_land" ? "Land" : "Homes"}</span>
    <span>{request.location}</span>
    {request.filters.maximumPriceUsd !== undefined && <span>≤ {formatCompactPrice(request.filters.maximumPriceUsd)}</span>}
    {request.filters.minimumBedrooms !== undefined && <span>{request.filters.minimumBedrooms}+ beds</span>}
  </div>;
}

function formatCompactPrice(price: number) {
  if (price >= 1_000_000 && price % 1_000_000 === 0) return `$${price / 1_000_000}m`;
  if (price >= 1_000 && price % 1_000 === 0) return `$${price / 1_000}k`;
  return formatPrice(price);
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

export function canAnalyzeListing(listing: Pick<PublicListing, "price">) {
  return typeof listing.price === "number" && Number.isFinite(listing.price) && listing.price > 0;
}
