import { useEffect, useState } from "react";
import { StrComparableCard } from "./StrComparableCard.js";
import { loadStrComparableLibrary, type StrComparableLibraryItem } from "./str-comparable-library-client.js";
import { ProductHeader, type ProductView } from "./ProductHeader.js";

export type LibrarySort = "recent" | "rating" | "distance" | "booking";

export function StrComparableLibrary({ onNavigate, loader = loadStrComparableLibrary }: Readonly<{
  onNavigate(view: ProductView): void;
  loader?: () => Promise<readonly StrComparableLibraryItem[]>;
}>) {
  const [items, setItems] = useState<readonly StrComparableLibraryItem[]>([]);
  const [sort, setSort] = useState<LibrarySort>("recent");
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let active = true;
    void loader().then((result) => { if (active) { setItems(result); setStatus("ready"); } })
      .catch(() => { if (active) setStatus("error"); });
    return () => { active = false; };
  }, [loader]);

  const sorted = sortComparableLibrary(items, sort);
  return <main className="str-comparator str-library" aria-labelledby="str-library-title" aria-busy={status === "loading"}>
    <ProductHeader activeView="library" onNavigate={onNavigate} />
    <header className="str-library__header">
      <p className="eyebrow">Stored STR evidence</p>
      <div className="str-library__heading-row">
        <div><h1 id="str-library-title">STR comparable library</h1><p>Every unique Airbnb stay observed across your Zillow property comparisons.</p></div>
        {status === "ready" && <strong>{items.length} {items.length === 1 ? "comparable" : "comparables"}</strong>}
      </div>
    </header>

    <section className="str-library__toolbar" aria-label="Comparable sorting controls">
      <label htmlFor="str-library-sort">Sort by</label>
      <select id="str-library-sort" value={sort} onChange={(event) => setSort(event.target.value as LibrarySort)}>
        <option value="recent">Recently observed</option>
        <option value="rating">Highest rating</option>
        <option value="distance">Closest distance</option>
        <option value="booking">Highest booked or blocked</option>
      </select>
      <p>Distance means the closest recorded match to an associated Zillow property.</p>
    </section>

    {status === "loading" && <div className="str-library__state" role="status"><span className="loading-spinner" aria-hidden="true" /><strong>Loading saved comparables…</strong></div>}
    {status === "error" && <div className="str-library__state str-library__state--error" role="alert"><strong>We could not load the STR library.</strong><span>Try again after confirming the local API is running.</span></div>}
    {status === "ready" && sorted.length === 0 && <div className="str-library__state" role="status"><strong>No stored comparables yet.</strong><span>Promote a Home and compare it with nearby STRs to build this library.</span></div>}
    {status === "ready" && sorted.length > 0 && <section className="str-library__cards" aria-label="Stored STR comparables">
      {sorted.map((item, index) => <StrComparableCard key={item.listingUrl} candidate={item} rank={index + 1} context={libraryContext(item)} />)}
    </section>}
  </main>;
}

export function sortComparableLibrary(items: readonly StrComparableLibraryItem[], sort: LibrarySort) {
  return [...items].sort((left, right) => {
    if (sort === "rating") return descending(right.rating, left.rating) || descending(right.reviewCount, left.reviewCount);
    if (sort === "distance") return ascending(left.distanceMiles, right.distanceMiles);
    if (sort === "booking") return descending(right.calendarUnavailablePercentage, left.calendarUnavailablePercentage);
    return right.latestObservedAt.localeCompare(left.latestObservedAt);
  });
}

function libraryContext(item: StrComparableLibraryItem) {
  const matches = `${item.associatedPropertyCount} associated Zillow ${item.associatedPropertyCount === 1 ? "property" : "properties"}`;
  const observed = item.latestObservedAt ? `Last observed ${new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(item.latestObservedAt))}` : undefined;
  return [matches, observed].filter(Boolean).join(" · ");
}

function descending(right: number | undefined, left: number | undefined) { return finite(right, -Infinity) - finite(left, -Infinity); }
function ascending(left: number | undefined, right: number | undefined) { return finite(left, Infinity) - finite(right, Infinity); }
function finite(value: number | undefined, fallback: number) { return typeof value === "number" && Number.isFinite(value) ? value : fallback; }
