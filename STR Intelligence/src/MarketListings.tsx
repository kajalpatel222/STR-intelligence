import React, { useEffect, useState } from "react";
import type { MarketListing, YosemiteGateway } from "../shared/market-listing.js";
import { loadMarketListings } from "./market-listings-client.js";
import { ProductHeader, type ProductView } from "./ProductHeader.js";

export type MarketListingSortKey = "revenue" | "occupancy" | "adr" | "bookings" | "rating";
export type MarketListingSortDirection = "asc" | "desc";
export type MarketListingArea = "all" | YosemiteGateway;
export const MARKET_LISTINGS_PAGE_SIZE = 25;
export const MARKET_LISTING_COMPARISON_LIMIT = 3;

const AREA_OPTIONS: readonly Readonly<{ value: MarketListingArea; label: string }>[] = [
  { value: "all", label: "All Yosemite areas" },
  { value: "arch_rock", label: "Arch Rock / Mariposa" },
  { value: "big_oak_flat", label: "Big Oak Flat / Groveland" },
  { value: "south", label: "South Entrance" },
];

function areaLabel(area: MarketListingArea) {
  return AREA_OPTIONS.find((option) => option.value === area)?.label ?? "Yosemite area";
}

export function MarketListings({ onNavigate, loader = loadMarketListings }: Readonly<{ onNavigate(view: ProductView): void; loader?: typeof loadMarketListings }>) {
  const [collection, setCollection] = useState<Awaited<ReturnType<typeof loader>>>();
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [sort, setSort] = useState<MarketListingSortKey>("revenue");
  const [sortDirection, setSortDirection] = useState<MarketListingSortDirection>("desc");
  const [query, setQuery] = useState("");
  const [area, setArea] = useState<MarketListingArea>("all");
  const [bedrooms, setBedrooms] = useState("all");
  const [type, setType] = useState("all");
  const [page, setPage] = useState(1);
  const [selectedUrls, setSelectedUrls] = useState<readonly string[]>([]);
  const [comparisonOpen, setComparisonOpen] = useState(false);
  useEffect(() => { let active = true; void loader().then((value) => { if (active) { setCollection(value); setStatus("ready"); } }).catch(() => { if (active) setStatus("error"); }); return () => { active = false; }; }, [loader]);
  const rows = sortMarketListings(filterMarketListings(collection?.listings ?? [], query, bedrooms, type, area), sort, sortDirection);
  const pageCount = Math.max(1, Math.ceil(rows.length / MARKET_LISTINGS_PAGE_SIZE));
  const visibleRows = paginateMarketListings(rows, page);
  const types = [...new Set((collection?.listings ?? []).map((row) => row.propertyType).filter(Boolean))].sort();
  const selectedListings = selectedUrls.flatMap((url) => {
    const listing = collection?.listings.find((row) => row.listingUrl === url);
    return listing ? [listing] : [];
  });
  useEffect(() => { setPage(1); }, [sort, sortDirection, query, bedrooms, type, area]);

  function toggleComparison(listingUrl: string) {
    setSelectedUrls((current) => toggleMarketListingComparison(current, listingUrl));
    setComparisonOpen(false);
  }

  function selectSort(nextSort: MarketListingSortKey) {
    setSort(nextSort);
    setSortDirection("desc");
  }

  function toggleSort(nextSort: MarketListingSortKey) {
    if (sort === nextSort) {
      setSortDirection((current) => current === "desc" ? "asc" : "desc");
      return;
    }
    setSort(nextSort);
    setSortDirection("desc");
  }

  return <main className="market-listings app-shell" aria-labelledby="market-listings-title" aria-busy={status === "loading"}>
    <ProductHeader activeView="markets" onNavigate={onNavigate} />
    <header className="market-listings__header"><p className="eyebrow">Saved market evidence</p><h1 id="market-listings-title">Yosemite gateway listings</h1><p>{collection ? area === "all" ? `${rows.length.toLocaleString()} unique listings saved across Yosemite gateway areas` : `${rows.length.toLocaleString()} listings saved in ${areaLabel(area)}` : "A simple view of collected Airbnb market listings."}</p></header>
    <section className="market-listings__filters" aria-label="Listing filters">
      <label className="market-listings__search">Search listings<input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by name or property details" /></label>
      <label>Yosemite area<select value={area} onChange={(event) => setArea(event.target.value as MarketListingArea)}>{AREA_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
      <label>Sort by<select value={sort} onChange={(event) => selectSort(event.target.value as MarketListingSortKey)}><option value="revenue">Annual revenue</option><option value="occupancy">Occupancy</option><option value="adr">ADR</option><option value="bookings">Bookings</option><option value="rating">Rating</option></select></label>
      <label>Bedrooms<select value={bedrooms} onChange={(event) => setBedrooms(event.target.value)}><option value="all">All bedrooms</option>{["Studio", "1", "2", "3", "4", "5", "6+"].map((value) => <option key={value}>{value}</option>)}</select></label>
      <label>Property type<select value={type} onChange={(event) => setType(event.target.value)}><option value="all">All types</option>{types.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
      <strong>{rows.length} shown</strong>
    </section>
    {selectedUrls.length > 0 && <section className="market-listings__compare-bar" aria-label="Selected listings for comparison">
      <p><strong>{selectedUrls.length} of {MARKET_LISTING_COMPARISON_LIMIT} selected</strong><span>Select at least two listings to compare.</span></p>
      <div><button type="button" className="button-secondary" onClick={() => { setSelectedUrls([]); setComparisonOpen(false); }}>Clear</button><button type="button" disabled={selectedUrls.length < 2} onClick={() => setComparisonOpen(true)}>Compare selected</button></div>
    </section>}
    {comparisonOpen && selectedListings.length >= 2 && <MarketListingComparison listings={selectedListings} onClose={() => setComparisonOpen(false)} />}
    {status === "loading" && <p role="status">Loading saved market listings…</p>}
    {status === "error" && <p role="alert">Market listings could not be loaded.</p>}
    {status === "ready" && !collection && <p role="status">No market collection has been saved yet.</p>}
    {status === "ready" && collection && rows.length === 0 && <p className="market-listings__empty" role="status">No saved listings match these filters.</p>}
    {rows.length > 0 && <><div className="market-listings__table-wrap"><table><thead><tr><th>Compare</th><th>Listing</th><th>Property</th><SortableHeader label="ADR" sortKey="adr" activeSort={sort} direction={sortDirection} onSort={toggleSort} /><SortableHeader label="Occupancy" sortKey="occupancy" activeSort={sort} direction={sortDirection} onSort={toggleSort} /><SortableHeader label="Annual revenue" sortKey="revenue" activeSort={sort} direction={sortDirection} onSort={toggleSort} /><th>Bookings</th><SortableHeader label="Rating" sortKey="rating" activeSort={sort} direction={sortDirection} onSort={toggleSort} /></tr></thead><tbody>{visibleRows.map((row) => <MarketRow key={row.listingUrl} row={row} selected={selectedUrls.includes(row.listingUrl)} selectionFull={selectedUrls.length >= MARKET_LISTING_COMPARISON_LIMIT} onToggle={toggleComparison} />)}</tbody></table></div><nav className="market-listings__pagination" aria-label="Market listing pages"><button type="button" disabled={page === 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>Previous</button><span>Page {page} of {pageCount}</span><button type="button" disabled={page === pageCount} onClick={() => setPage((value) => Math.min(pageCount, value + 1))}>Next</button></nav></>}
  </main>;
}

function SortableHeader({ label, sortKey, activeSort, direction, onSort }: Readonly<{ label: string; sortKey: MarketListingSortKey; activeSort: MarketListingSortKey; direction: MarketListingSortDirection; onSort(key: MarketListingSortKey): void }>) {
  const active = activeSort === sortKey;
  const nextDirection = active && direction === "desc" ? "ascending" : "descending";
  return <th aria-sort={active ? (direction === "desc" ? "descending" : "ascending") : "none"}>
    <button type="button" className={active ? "market-listings__sort is-active" : "market-listings__sort"} onClick={() => onSort(sortKey)} aria-label={`Sort ${label} ${nextDirection}`}>
      <span>{label}</span>
      <svg viewBox="0 0 12 16" aria-hidden="true"><path d="M3 1 1 3h4L3 1Zm0 14 2-2H1l2 2ZM9 1 7 3h4L9 1Zm0 14 2-2H7l2 2Z" /><path className="market-listings__sort-active" d={direction === "desc" ? "M6 11 9 14l3-3H6Z" : "M6 5 9 2l3 3H6Z"} /></svg>
    </button>
  </th>;
}

function MarketRow({ row, selected, selectionFull, onToggle }: Readonly<{ row: MarketListing; selected: boolean; selectionFull: boolean; onToggle(listingUrl: string): void }>) { return <tr className={selected ? "is-selected" : undefined}><td className="market-listings__select"><input type="checkbox" checked={selected} disabled={!selected && selectionFull} onChange={() => onToggle(row.listingUrl)} aria-label={`${selected ? "Remove" : "Add"} ${row.name} ${selected ? "from" : "to"} comparison`} /></td><td><div className="market-listings__identity">{row.imageUrl ? <img src={row.imageUrl} alt="" /> : <span aria-hidden="true" /> }<a href={row.listingUrl} target="_blank" rel="noreferrer">{row.name}</a></div></td><td>{[row.propertyType, row.bedrooms && `${row.bedrooms} bd`, row.accommodates && `Sleeps ${row.accommodates}`].filter(Boolean).join(" · ")}</td><td>{money(row.adrUsd)}</td><td>{percent(row.occupancyPercent)}</td><td><strong>{money(row.annualRevenueUsd)}</strong></td><td>{row.bookingsLtm ?? "—"}</td><td>{row.ratingPercent ? `${row.ratingPercent}/100` : "—"}</td></tr>; }

function MarketListingComparison({ listings, onClose }: Readonly<{ listings: readonly MarketListing[]; onClose(): void }>) {
  return <section className="market-listings__comparison" aria-labelledby="market-comparison-title">
    <header><div><p className="eyebrow">Side-by-side view</p><h2 id="market-comparison-title">Compare selected listings</h2></div><button type="button" className="button-secondary" onClick={onClose}>Close comparison</button></header>
    <div className="market-listings__comparison-grid">{listings.map((listing) => <article key={listing.listingUrl}>
      {listing.imageUrl ? <img src={listing.imageUrl} alt={`Exterior or interior of ${listing.name}`} /> : <div className="market-listings__comparison-fallback" aria-hidden="true" />}
      <div className="market-listings__comparison-body"><h3><a href={listing.listingUrl} target="_blank" rel="noreferrer">{listing.name}</a></h3><p>{[listing.propertyType, listing.bedrooms && `${listing.bedrooms} bedrooms`, listing.accommodates && `Sleeps ${listing.accommodates}`].filter(Boolean).join(" · ") || "Property details unavailable"}</p><dl><div><dt>Annual revenue</dt><dd>{money(listing.annualRevenueUsd)}</dd></div><div><dt>ADR</dt><dd>{money(listing.adrUsd)}</dd></div><div><dt>Occupancy</dt><dd>{percent(listing.occupancyPercent)}</dd></div><div><dt>Estimated stays</dt><dd>{listing.bookingsLtm ?? "—"}</dd></div><div><dt>Rating</dt><dd>{listing.ratingPercent ? `${listing.ratingPercent}/100` : "—"}</dd></div><div><dt>Active days</dt><dd>{listing.activeDaysLtm ?? "—"}</dd></div></dl></div>
    </article>)}</div>
  </section>;
}

export function toggleMarketListingComparison(selected: readonly string[], listingUrl: string, limit = MARKET_LISTING_COMPARISON_LIMIT) {
  if (selected.includes(listingUrl)) return selected.filter((value) => value !== listingUrl);
  return selected.length >= limit ? [...selected] : [...selected, listingUrl];
}
export function sortMarketListings(rows: readonly MarketListing[], key: MarketListingSortKey, direction: MarketListingSortDirection = "desc") { const field: Record<MarketListingSortKey, keyof MarketListing> = { revenue: "annualRevenueUsd", occupancy: "occupancyPercent", adr: "adrUsd", bookings: "bookingsLtm", rating: "ratingPercent" }; return [...rows].sort((a, b) => compareOptionalNumbers(a[field[key]], b[field[key]], direction)); }
export function filterMarketListings(rows: readonly MarketListing[], query: string, bedrooms = "all", propertyType = "all", area: MarketListingArea = "all") { const needle = query.trim().toLocaleLowerCase(); return rows.filter((row) => (area === "all" || (row.gateways ?? [row.gateway]).includes(area)) && (bedrooms === "all" || row.bedrooms === bedrooms) && (propertyType === "all" || row.propertyType === propertyType) && (!needle || [row.name, row.propertyType, row.roomType, row.bedrooms].some((value) => value?.toLocaleLowerCase().includes(needle)))); }
export function paginateMarketListings(rows: readonly MarketListing[], page: number, pageSize = MARKET_LISTINGS_PAGE_SIZE) { const safePage = Math.max(1, Math.floor(page)); return rows.slice((safePage - 1) * pageSize, safePage * pageSize); }
function compareOptionalNumbers(left: unknown, right: unknown, direction: MarketListingSortDirection) { const leftNumber = numeric(left); const rightNumber = numeric(right); if (leftNumber === undefined) return rightNumber === undefined ? 0 : 1; if (rightNumber === undefined) return -1; return direction === "desc" ? rightNumber - leftNumber : leftNumber - rightNumber; }
function numeric(value: unknown) { return typeof value === "number" && Number.isFinite(value) ? value : undefined; }
function money(value?: number) { return value === undefined ? "—" : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value); }
function percent(value?: number) { return value === undefined ? "—" : `${value}%`; }
