# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Backend (run from `backend/`)
```
npm run dev      # Start Express server on port 4000 (uses nodemon)
npm run start    # Production start
npm run seed     # Seed DB: 16 teams, stadiums, free agents, season
```

### Frontend (run from `frontend/`)
```
npm run dev      # Start Vite dev server on port 5173
npm run build    # Production build
npm run preview  # Preview production build
```

### Database
```
npx prisma migrate dev    # Apply migrations (from backend/)
npx prisma studio         # GUI for DB inspection
```

No test suite is configured.

## UI Verification

Do not run Playwright, take screenshots, or launch browsers to verify frontend changes. The user handles all visual UI verification themselves.

## Architecture

Full-stack baseball management game: Express REST API + React SPA + PostgreSQL via Prisma.

### Backend (`backend/`)

- **`index.js`** — Express entry point; mounts all route files under `/api/*`
- **`config.js`** — Single constant: `USER_TEAM_ID = 1` (hardcoded user team)
- **`db/prisma.js`** — Prisma client singleton
- **`prisma/schema.prisma`** — 10 models: `Division`, `Team`, `Player`, `Season`, `GameSchedule`, `StadiumSection`, `Finance`, `Scout`, `GameLineup`, `GameEvent`, `FreeAgentAuction`, `AuctionBid`

**Routes** (`routes/`) handle HTTP concerns only; business logic lives in **Services** (`services/`):

| Service | Responsibility |
|---|---|
| `gameSimulator.js` | Full game engine: 9+ innings, up to 15 max, lineup cycling |
| `atBatSimulator.js` | At-bat outcomes weighted by batter vs. pitcher skill |
| `scheduleGenerator.js` | Double round-robin for 16 teams (30 days, 240 games) using circle rotation |
| `auctionService.js` | Free agent auctions; CPU teams bid with randomized aggressiveness (0.05–0.25) |
| `economy.js` | Revenue: attendance (40–90% of capacity based on reputation) × ticket price + 15% merch; daily salary = annual / 162 |
| `lineup.js` | Converts DB roster to ordered lineup array |

### Frontend (`frontend/src/`)

- **`App.jsx`** — React Router v6 route definitions
- **`api.js`** — Thin fetch wrapper used by all pages (no axios/react-query)
- **`pages/`** — 8 page components: `NewGame`, `Dashboard`, `Roster`, `Market`, `Stadium`, `Scouts`, `Finances`, `GameView`
- **`components/`** — Shared UI: `Navbar`, `Leaderboard`, `StadiumGrid`, `SectionModal`

Styling is Tailwind CSS v3 with no component library.

### Database / Environment

Requires a PostgreSQL instance. Copy `backend/.env.example` to `backend/.env` and set `DATABASE_URL`. Run `npm run seed` once after a fresh DB to populate all game data.

### Key Design Decisions

- User team is always `id = 1` (set in `config.js`). All "user team" queries filter by this constant.
- Game simulation is stateless: `gameSimulator.js` computes the full game result in memory and persists events to `GameEvent` in bulk.
- CPU teams in auctions bid automatically when the user advances a season day; no real-time loop.
- Stadium sections are pre-seeded (not user-created); upgrades increase capacity/level on existing rows.
