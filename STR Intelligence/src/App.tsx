const highlights = [
  "Agentic ingestion pipeline foundation",
  "React + TypeScript frontend shell",
  "Supabase and pgvector ready for Stage 1.1",
  "Bright Data source adapters planned for Zillow and Land.com",
];

export default function App() {
  return (
    <main className="page-shell">
      <section className="hero">
        <p className="eyebrow">STR Intelligence</p>
        <h1>Week 3 Stage 1.0</h1>
        <p className="lede">
          A clean foundation for an agentic short-term-rental intelligence system
          focused on Oakhurst, California and a staged ingestion pipeline.
        </p>
      </section>

      <section className="card-grid" aria-label="Project highlights">
        {highlights.map((item) => (
          <article key={item} className="card">
            <span className="card-dot" aria-hidden="true" />
            <p>{item}</p>
          </article>
        ))}
      </section>
    </main>
  );
}
