# STR Intelligence

Stage 1.0 establishes the base application shell for the STR Intelligence project in the saved `Week 3` directory.

## Stage 1.0

- React + TypeScript scaffold with Vite.
- Frontend structure prepared for later API, workflow, adapter, and persistence modules.
- No credentials are required yet.

## Stage 1 Roadmap

- 1.1 Supabase schema and connection
- 1.2 Bright Data Zillow ingestion
- 1.3 Normalization, validation, deduplication, weekly snapshots
- 1.4 Land.com adapter reusing the same source interface

## Architecture Note

Stage 1 begins with an orchestrated ingestion pipeline. Scraping feeds structured source records into validation and reflection after collection, rather than baking those checks into the scraper itself.

## Scripts

- `npm run dev`
- `npm run build`
- `npm run check`
- `npm run preview`
