import React from "react";

export type ProductView = "search" | "library" | "financials" | "markets";

export function ProductHeader({ activeView, onNavigate }: Readonly<{
  activeView: ProductView;
  onNavigate(view: ProductView): void;
}>) {
  return <header className="site-header product-nav">
    <button className="brand product-nav__brand" type="button" onClick={() => onNavigate("search")} aria-label="STR Intelligence property search">
      <span className="brand-mark">SI</span>
      <span>STR Intelligence</span>
    </button>
    <nav className="product-nav__links" aria-label="Primary navigation">
      <button type="button" className={activeView === "search" ? "is-active" : ""} aria-current={activeView === "search" ? "page" : undefined} onClick={() => onNavigate("search")}>Property Search</button>
      <button type="button" className={activeView === "library" ? "is-active" : ""} aria-current={activeView === "library" ? "page" : undefined} onClick={() => onNavigate("library")}>STR Library</button>
      <button type="button" className={activeView === "financials" ? "is-active" : ""} aria-current={activeView === "financials" ? "page" : undefined} onClick={() => onNavigate("financials")}>Financial Dashboard</button>
      <button type="button" className={activeView === "markets" ? "is-active" : ""} aria-current={activeView === "markets" ? "page" : undefined} onClick={() => onNavigate("markets")}>Market Listings</button>
    </nav>
  </header>;
}
