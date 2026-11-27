# Cue — Watch · Read · Play

Cue is a private, mobile-first media journal and progress tracker for **Shows & Movies**, **Books, Manga & Comics**, and **Video Games**.

**Live App:** [cue-three-theta.vercel.app](https://cue-three-theta.vercel.app)

---

## Core Architecture: Atomic Units & Smart Containers

Cue separates media tracking into two layers so you never double-log progress:

- **Atomic Units (The Bricks):** Single TV/anime episodes, comic issues, book/manga chapters, movies, and game story chapters/missions.
- **Smart Containers (The Buckets):** Linear containers (TV seasons, manga volumes, game campaigns) and overlapping relational containers (Comic TPBs, Hardcovers, Omnibuses, Compendiums, Movie Collections, and custom Reading Orders/Events).
- **Automatic Bi-Directional Sync:** Logging individual comic issues (`#1–6`) automatically advances and checks off any TPBs or Omnibuses containing those issues — and checking off a collected edition retroactively marks its underlying issues read across your library.
- **Catch-Up Prompt Sheet:** Marking a non-adjacent episode, chapter, or issue prompts to catch up all skipped prior atoms (with a per-title *"Never ask"* toggle).
- **Finished Date Timeline Sync & Multi-Run History:** Backdating or editing a title's completion date automatically updates **Your Days**, **16-Week Pulse**, **When You Engage**, and **Hall of Fame** — plus supports multiple dated rewatch, reread, and replay runs (`completedRuns`) per title.
- **Resilient Multi-API Adapters & Offline Queueing:** All external providers are normalized into unified Cue schemas with `Promise.allSettled` fault isolation, strict timeouts across client & serverless calls (`src/utils/safeFetch.ts`), per-host `429` backoff, and an **Offline ISBN Queue** (`pendingIsbnScans`) that saves shelf scans offline and auto-syncs when online.

---

## Key Features

- **Cue Queue (`Up Next`):** Unfinished released episodes, chapters, comic issues, and active games in one clean queue — automatically filtering out unreleased TBA or future solicitations while preserving dateless classic shows.
- **Cue Mind (`Continue` & `Discover`):** Contextual taste engine hidden cleanly behind Journal onboarding until you have logged at least 5 entries, helping you either resume momentum (`Smart`, `Quick`, `Deep`, `Finish`) or discover trending runs and series.
- **Watch (TV, Anime & Movies):** Unified Watch view powered by TMDB and AniList/AniZip, including episode stills, per-episode ratings, rewatches, and "Where to watch" providers.
- **Read (Novels, Manga, Comics & Omnibuses):** Open Library, MangaDex, Jikan/AniList, Google Books, and cross-publisher comic issue hydration covering **Marvel, DC, Image, Dark Horse Comics, IDW Publishing, BOOM! Studios**, optional universal **Comic Vine** (`COMICVINE_API_KEY`), live camera **ISBN Barcode Scanner**, and a custom indie comic run creator.
- **Play (Games):** IGDB & Steam-backed game library with story chapter/mission tracking and one-tap **Suggest chapters & missions** (via curated catalog, Wikipedia/web lookup, or Google AI Mode copy-and-paste parser).
- **Simple & Advanced Detail Modes:** Switch seamlessly between distraction-free quick logging and deep per-unit stats, finished-date editing, ratings histograms, and timelines.
- **Journal, Analytics & Wrapped:** 16-Week Pulse (`Logs` / `Time`), Your Days 16x7 activity grid, When You Engage matrix, Hall of Fame records, backlog time forecast, Taste DNA, and a **Year-in-Review / 2026 Wrapped** generator with PNG card export.
- **Event Reading Orders & Bulk Edit:** Chronological issue-level comic Reading Orders (e.g., *House of X / Powers of X*, *Secret Wars (2015)*, *Annihilation*) with reordering and live atomic sync, plus multi-select **Bulk Edit** across Watch, Read, and Play.
- **Smart Import & Cloud Sync:** Import IMDb CSVs, Letterboxd CSVs, Goodreads CSVs, or full Cue JSON backups with ISBN/edition-aware deduplication, plus optional no-account cross-device cloud sync via pairing code or QR code.

---

## Serverless API Routes (`api/`)

| File | Purpose |
| --- | --- |
| `api/tmdb.ts` | TMDB proxy for shows, movies, trending rails, and watch providers |
| `api/igdb.ts` | IGDB / Twitch game search and metadata lookup |
| `api/trending-games.ts` | Trending & recent game discovery feed |
| `api/comic-series.ts` | Comic series, Dark Horse / IDW / BOOM! / Fandom / optional Comic Vine runs, omnibuses & single issues |
| `api/game-chapters.ts` | Story chapter & mission lookup and web suggestion parser |
| `api/imdb-resolve.ts` | Batched IMDb title ID resolution for GDPR/CSV imports |
| `api/sync.ts` | No-account pairing-code cloud state sync |
| `api/health.ts` | Upstream API connectivity & latency check (surfaced in Settings) |

---

## Development

```bash
npm install
npm run dev
npm run build
```

Production builds run `tsc -b && vite build` and deploy to Vercel (`vercel --prod --yes`).
