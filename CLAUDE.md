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
- **`config.js`** — Game-balance constants: `USER_TEAM_ID = 1` (hardcoded user team), season timing (`PRE_SEASON_DAYS`, `GAMES_PER_SEASON`, `ROSTER_CHECK_DAY`, `TRADE_DEADLINE_DAY`, `AUCTION_DEADLINE_DAY`, `LUXURY_TAX_PROJECTION_DAY`, etc.), roster caps (`MAX_ROSTER_SIZE`, `MAX_MINOR_ROSTER_SIZE`), market/draft sizing (`MARKET_PLAYER_CAP`, `DRAFT_POOL_SIZE`), and tuning knobs for the Home Run Derby and news feat-detection thresholds
- **`db/prisma.js`** — Prisma client singleton
- **`prisma/schema.prisma`** — ~24 models, grouped by area:
  - Core: `Division`, `Team`, `Player`, `Season`, `SeasonRecord`, `GameSchedule`
  - Gameplay: `GameLineup`, `GameEvent`, `TeamLineup`, `PlayoffSeries`
  - Economy: `StadiumSection`, `Finance`, `LuxuryTaxRecord`
  - Personnel: `Scout`, `Coach`, `Draft`, `DraftProspect`, `Trade`, `TradeItem`
  - Market: `FreeAgentAuction`, `AuctionBid`
  - Broadcast: `BroadcastCompany`, `BroadcastOffer`, `BroadcastContract`
  - Misc: `NewsItem`, `HomeRunDerbyEvent`, `DerbyEntry`, `DerbySwing`

**Routes** (`routes/`) handle HTTP concerns only; business logic lives in **Services** (`services/`). Each route file is mounted at `/api/<name>`:

| Route | Handles |
|---|---|
| `newgame.js` | Creates a new save/franchise |
| `teams.js` | List/detail teams, user's team, league overview |
| `players.js` | Team roster stats, free agents, promote/demote/renew, player stats |
| `stadium.js` | Grandstand sections: pricing, upgrades, new builds, floor expansion |
| `season.js` | Season status, start season, advance day, schedule |
| `games.js` | Single game detail + simulate |
| `finances.js` | Team finance ledger |
| `scouts.js` | Scouts: list/hire, assign, collect scouting reports |
| `auctions.js` | Free agent auctions: list/detail/bid |
| `lineup.js` | Get/set the team's lineup |
| `broadcast.js` | Broadcast offers (accept/reject), current contract, companies |
| `playoffs.js` | Bracket view, simulate a series game, simulate/advance a round |
| `coaches.js` | Hire/fire coaches, assign to a player |
| `draft.js` | Current draft pool, advance CPU picks, user pick |
| `news.js` | League news feed |
| `history.js` | Champions, past seasons, all-time stats/recalculation |
| `trades.js` | Sent/received offers, history, create/accept/reject/cancel |
| `derby.js` | Home run derby: list/detail, create entry, simulate |

**Services** (`services/`):

| Service | Responsibility |
|---|---|
| `gameSimulator.js` | Full game engine: 9+ innings, up to 15 max, lineup cycling |
| `atBatSimulator.js` | At-bat outcomes weighted by batter vs. pitcher skill |
| `scheduleGenerator.js` | Double round-robin for 16 teams (30 days, 240 games) using circle rotation |
| `auctionService.js` | Free agent auctions; CPU teams bid with randomized aggressiveness (0.05–0.25) |
| `economy.js` | Home game revenue: attendance (4–14% of fan_base regular season, 14–25% playoffs, capped at capacity) × capacity-weighted ticket price + merch (1–5% of fan_base × $20–50/fan) − operating cost (capacity × 0.5); away games earn merch only |
| `lineup.js` | Converts DB roster to ordered lineup array |
| `gamePlay.js` | Orchestrates a single game: builds lineups, runs `gameSimulator`, applies injuries, updates standings/fan base, persists results |
| `cpuTeamManagement.js` | End-of-season CPU revenue distribution (flat $100–300/fan payout) and CPU roster upkeep (detects/fills missing positions via cut-and-replace) |
| `playerService.js` | End-of-season skill fluctuation (growth/decline vs. `growth_age`) and annual contract-years decrement |
| `playerInvestmentService.js` | CPU teams spend a budget-derived pool to buy up `current_skill` points on their weakest players, at skill-tiered marginal cost |
| `retiredPlayer.js` | Retires active/free-agent players aged 40+ each season, clearing them from lineups and rosters |
| `injuryService.js` | Post-game injury rolls (age-scaled probability, 3–15 day duration), plus daily recovery countdown |
| `skillCurve.js` | Precomputed `skill^1.5` lookup table exposing `effectiveSkill()`, a convex skill-weighting used across auctions/derby/etc. |
| `coachService.js` | Applies per-specialty coach bonuses (batting/pitching skill bumps, conditioning recovery) to the user's roster and deducts coach salaries |
| `draftService.js` | Draft pool generation (prospects + market rookies/young free agents), CPU auto-picks, and user pick handling |
| `tradeService.js` | Trade offer evaluation/valuation (skill + upside − salary − age risk) and CPU accept/reject logic, deadline-aware |
| `luxuryTaxService.js` | Progressive luxury tax on payroll above the league 75th-percentile threshold, with an inefficiency surcharge based on cost-per-skill vs. league median |
| `playoffService.js` | Builds the playoff bracket (top 4 per division), tracks/updates each team's "desperation index", simulates series/rounds |
| `broadcastService.js` | TV/radio broadcast contracts; generates per-company offers each season (reputation-gated), CPU teams auto-accept/reject |
| `derbyService.js` | Home Run Derby: swing-by-swing HR probability from batter skill, CPU entrant selection, bracket/tiebreak simulation |
| `newsService.js` | Thin wrapper that creates `NewsItem` rows, used by other services to log league events |
| `newsDetection.js` | Scans a simulated game's play-by-play for feats (no-hitters/perfect games, cycles, multi-HR games, extra-innings, win/loss streaks) to feed the news feed |

### Frontend (`frontend/src/`)

- **`App.jsx`** — React Router v6 route definitions; 22 top-level routes plus `/game/:id` and `/derby/:id`
- **`api.js`** — Thin fetch wrapper used by all pages (no axios/react-query); one flat `api` object grouped by feature (teams, players, stadium, season, games, finances, scouts, lineup, auctions, playoffs, coaches, draft, news, history, broadcast, trades, derby)
- **`pages/`** — 23 files: `NewGame`, `Dashboard`, `Roster`, `Rookie`, `Market`, `Stars`, `Trades`, `Stadium`, `Scouts`, `Finances`, `TeamsOverview`, `Schedule`, `Lineup`, `Broadcast`, `Playoffs`, `Coaches`, `Draft`, `News`, `History`, `GameView`, `Derby`, `DerbyView`, and `AllTimePlayers` (rendered as a tab inside `History`, not its own route)
- **`components/`** — Shared UI: `Navbar`, `Leaderboard`, `StadiumGrid`, `SectionModal`, `Pagination`, `TeamBadge`, `SkillTierBadge`, `FavoriteButton`

Styling is Tailwind CSS v3 with no component library.

### Database / Environment

Requires a PostgreSQL instance. Copy `backend/.env.example` to `backend/.env` and set `DATABASE_URL`. Run `npm run seed` once after a fresh DB to populate all game data.

### Key Design Decisions

- User team is always `id = 1` (set in `config.js`). All "user team" queries filter by this constant.
- Game simulation is stateless: `gameSimulator.js` computes the full game result in memory and persists events to `GameEvent` in bulk.
- CPU teams in auctions bid automatically when the user advances a season day; no real-time loop.
- Stadium sections are pre-seeded (not user-created); upgrades increase capacity/level on existing rows.
- CPU teams get a flat end-of-season revenue payout (`cpuTeamManagement.js`, $100–300/fan, from `CPU_REVENUE_PER_FAN_MIN`/`CPU_REVENUE_PER_FAN_MAX` in `config.js`) separate from the per-game attendance/ticket/merch formula in `economy.js` — don't conflate the two when touching economy code.
- Playoff seeding/desperation index is tracked per-team directly on the `Team` model (`desperation_index`, `min_growth_threshold`), not a separate table.
