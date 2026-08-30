import { useState, type FormEvent, type KeyboardEvent } from "react";
import { formatLandArea } from "./listing-format";
import { InvestmentCriteriaPanel } from "./InvestmentCriteriaPanel";
import type { PublicAttentionEvaluation } from "../shared/attention-api";
import type { InvestmentCriteria } from "../shared/investment-criteria";
import { evaluateCurrentListings } from "./attention-client";

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
  const filteredLocations = SUPPORTED_LOCATIONS.filter((option) => option.toLowerCase().includes(location.toLowerCase()));

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
    setIsSearching(true);

    try {
      const response = await fetch("/api/property-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ propertyType, location: request.location }),
      });
      const outcome = await response.json() as SearchOutcome;
      setSearchOutcome(outcome);
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
                {searchOutcome.listings?.map((listing, index) => {
                  const evaluation = attentionEvaluations.find((item) => item.listingIndex === index);
                  return (
                  <article className="listing-result" key={`${listing.url ?? listing.address ?? "listing"}-${index}`}>
                    <div className="listing-result__layout">
                      {listing.imageUrl ? <img className="listing-result__image" src={listing.imageUrl} alt={`Property at ${listing.address ?? listing.title ?? "this listing"}`} loading="lazy" /> : <div className="listing-result__image listing-result__image--fallback" role="img" aria-label="Property image unavailable">⌂</div>}
                      <div className="listing-result__content">
                        <div className="listing-result__header"><div><h3>{listing.title ?? listing.address ?? (searchRequest?.source === "zillow_land" ? "Land for sale" : "Home for sale")}</h3><p>{[listing.city, listing.state, listing.postalCode].filter(Boolean).join(", ")}</p></div><div className="listing-result__price-stack">{listing.price !== undefined && <strong className="listing-result__price">{formatPrice(listing.price)}</strong>}{evaluation && <div className="listing-result__scores" aria-label="Property evaluation scores"><span className="score-tag"><strong>{formatScore(evaluation.result.attentionScore)}</strong><small>Attention Score</small></span><span className="score-tag score-tag--confidence"><strong>{formatScore(evaluation.result.confidenceScore)}</strong><small>Confidence Score</small></span></div>}</div></div>
                    {(listing.propertyType || listing.zoningText) && <p className="listing-result__descriptor">{[listing.propertyType, listing.zoningText].filter(Boolean).join(" · ")}</p>}
                    <dl>
                      {searchRequest?.source !== "zillow_land" && listing.beds !== undefined && <div><dt>Beds</dt><dd>{listing.beds}</dd></div>}
                      {searchRequest?.source !== "zillow_land" && listing.baths !== undefined && <div><dt>Baths</dt><dd>{listing.baths}</dd></div>}
                      {searchRequest?.source !== "zillow_land" && listing.sqft !== undefined && <div><dt>Living area</dt><dd>{listing.sqft.toLocaleString()} sq ft</dd></div>}
                      {searchRequest?.source === "zillow_land" ? (
                        formatLandArea(listing) && <div><dt>Parcel size</dt><dd>{formatLandArea(listing)}</dd></div>
                      ) : listing.lotSqft !== undefined && listing.lotSqft > 0 && <div><dt>Lot area</dt><dd>{formatLotArea(listing.lotSqft)}</dd></div>}
                    </dl>
                    {evaluation && <div className="listing-result__reasons">{evaluation.explanation.positiveDrivers[0] && <p>{evaluation.explanation.positiveDrivers[0]}</p>}{(evaluation.explanation.concerns[0] ?? evaluation.explanation.missingEvidence[0]) && <p>{evaluation.explanation.concerns[0] ?? evaluation.explanation.missingEvidence[0]}</p>}</div>}
                    {listing.url && <a href={listing.url} target="_blank" rel="noreferrer">View listing <span aria-hidden="true">↗</span></a>}
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
