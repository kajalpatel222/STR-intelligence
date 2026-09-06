import React, { useEffect, useState } from "react";
import type { MarketListing } from "../shared/market-listing.js";
import { loadMarketListings } from "./market-listings-client.js";
import { ProductHeader, type ProductView } from "./ProductHeader.js";

export type MarketListingSortKey = "revenue" | "occupancy" | "adr" | "bookings" | "rating";
export const MARKET_LISTINGS_PAGE_SIZE = 25;

export function MarketListings({ onNavigate, loader = loadMarketListings }: Readonly<{ onNavigate(view: ProductView): void; loader?: typeof loadMarketListings }>) {
  const [collection, setCollection] = useState<Awaited<ReturnType<typeof loader>>>();
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [sort, setSort] = useState<MarketListingSortKey>("revenue");
  const [query, setQuery] = useState("");
  const [bedrooms, setBedrooms] = useState("all");
  const [type, setType] = useState("all");
  const [page, setPage] = useState(1);
  useEffect(() => { let active = true; void loader().then((value) => { if (active) { setCollection(value); setStatus("ready"); } }).catch(() => { if (active) setStatus("error"); }); return () => { active = false; }; }, [loader]);
  const rows = sortMarketListings(filterMarketListings(collection?.listings ?? [], query, bedrooms, type), sort);
  const pageCount = Math.max(1, Math.ceil(rows.length / MARKET_LISTINGS_PAGE_SIZE));
  const visibleRows = paginateMarketListings(rows, page);
  const types = [...new Set((collection?.listings ?? []).map((row) => row.propertyType).filter(Boolean))].sort();
  useEffect(() => { setPage(1); }, [sort, query, bedrooms, type]);

  return <main className="market-listings app-shell" aria-labelledby="market-listings-title" aria-busy={status === "loading"}>
    <ProductHeader activeView="markets" onNavigate={onNavigate} />
    <header className="market-listings__header"><p className="eyebrow">Saved market evidence</p><h1 id="market-listings-title">Yosemite gateway listings</h1><p>{collection ? `${collection.label} · ${collection.savedCount} of ${collection.providerTotalCount} provider listings saved` : "A simple view of collected Airbnb market listings."}</p></header>
    <section className="market-listings__filters" aria-label="Listing filters">
      <label className="market-listings__search">Search listings<input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by name or property details" /></label>
      <label>Sort by<select value={sort} onChange={(event) => setSort(event.target.value as MarketListingSortKey)}><option value="revenue">Highest revenue</option><option value="occupancy">Highest occupancy</option><option value="adr">Highest ADR</option><option value="bookings">Most bookings</option><option value="rating">Highest rating</option></select></label>
      <label>Bedrooms<select value={bedrooms} onChange={(event) => setBedrooms(event.target.value)}><option value="all">All bedrooms</option>{["Studio", "1", "2", "3", "4", "5", "6+"].map((value) => <option key={value}>{value}</option>)}</select></label>
      <label>Property type<select value={type} onChange={(event) => setType(event.target.value)}><option value="all">All types</option>{types.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
      <strong>{rows.length} shown</strong>
    </section>
    {status === "loading" && <p role="status">Loading saved market listings…</p>}
    {status === "error" && <p role="alert">Market listings could not be loaded.</p>}
    {status === "ready" && !collection && <p role="status">No market collection has been saved yet.</p>}
    {rows.length > 0 && <><div className="market-listings__table-wrap"><table><thead><tr><th>Listing</th><th>Property</th><th>ADR</th><th>Occupancy</th><th>Annual revenue</th><th>Bookings</th><th>Rating</th></tr></thead><tbody>{visibleRows.map((row) => <MarketRow key={row.listingUrl} row={row} />)}</tbody></table></div><nav className="market-listings__pagination" aria-label="Market listing pages"><button type="button" disabled={page === 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>Previous</button><span>Page {page} of {pageCount}</span><button type="button" disabled={page === pageCount} onClick={() => setPage((value) => Math.min(pageCount, value + 1))}>Next</button></nav></>}
  </main>;
}

function MarketRow({ row }: Readonly<{ row: MarketListing }>) { return <tr><td><div className="market-listings__identity">{row.imageUrl ? <img src={row.imageUrl} alt="" /> : <span aria-hidden="true" /> }<a href={row.listingUrl} target="_blank" rel="noreferrer">{row.name}</a></div></td><td>{[row.propertyType, row.bedrooms && `${row.bedrooms} bd`, row.accommodates && `Sleeps ${row.accommodates}`].filter(Boolean).join(" · ")}</td><td>{money(row.adrUsd)}</td><td>{percent(row.occupancyPercent)}</td><td><strong>{money(row.annualRevenueUsd)}</strong></td><td>{row.bookingsLtm ?? "—"}</td><td>{row.ratingPercent ? `${row.ratingPercent}/100` : "—"}</td></tr>; }
export function sortMarketListings(rows: readonly MarketListing[], key: MarketListingSortKey) { const field: Record<MarketListingSortKey, keyof MarketListing> = { revenue: "annualRevenueUsd", occupancy: "occupancyPercent", adr: "adrUsd", bookings: "bookingsLtm", rating: "ratingPercent" }; return [...rows].sort((a, b) => numeric(b[field[key]]) - numeric(a[field[key]])); }
export function filterMarketListings(rows: readonly MarketListing[], query: string, bedrooms = "all", propertyType = "all") { const needle = query.trim().toLocaleLowerCase(); return rows.filter((row) => (bedrooms === "all" || row.bedrooms === bedrooms) && (propertyType === "all" || row.propertyType === propertyType) && (!needle || [row.name, row.propertyType, row.roomType, row.bedrooms].some((value) => value?.toLocaleLowerCase().includes(needle)))); }
export function paginateMarketListings(rows: readonly MarketListing[], page: number, pageSize = MARKET_LISTINGS_PAGE_SIZE) { const safePage = Math.max(1, Math.floor(page)); return rows.slice((safePage - 1) * pageSize, safePage * pageSize); }
function numeric(value: unknown) { return typeof value === "number" && Number.isFinite(value) ? value : -Infinity; }
function money(value?: number) { return value === undefined ? "—" : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value); }
function percent(value?: number) { return value === undefined ? "—" : `${value}%`; }
