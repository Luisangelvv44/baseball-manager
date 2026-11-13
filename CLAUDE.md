# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Backend (run from `backend/`)
```
npm run dev      # Start Express server on port 4000 (uses nodemon)
npm run start    # Production start
npm run seed     # Seed DB: 24 teams, stadiums, free agents, season
```

### Frontend (run from `frontend/`)
```
npm run dev      # Start Vite dev server on port 5173
npm run build    # Production build
npm run preview  # Preview production build
```

### Local domains (optional, run from repo root)
```
node tools/dev-proxy.js   # Port 80 proxy: http://baseball.localhost -> Vite 5173 (incl. HMR), http://api.baseball.localhost -> Express 4000
```
`frontend/src/api.js` picks `http://api.baseball.localhost/api` when the page is opened on `baseball.localhost` (else `localhost:4000`; `VITE_API_URL` overrides). `localhost:5173` keeps working. `.claude/launch.json` has `backend`, `frontend` and `proxy` entries.

### Database
```
npx prisma migrate dev    # Apply migrations (from backend/)
npx prisma studio         # GUI for DB inspection
```

### Tests (run from `backend/`)
```
npx jest    # Backend Jest suite (backend/__tests__/), Prisma mocked via db/__mocks__/prisma.js
```
Always run this after backend changes and make sure it passes before considering the work done.
If you add a new Prisma model, add it to `createModel()` entries in `backend/db/__mocks__/prisma.js`
too. If a new service is called from code under test, mock it in the relevant `__tests__/*.test.js`
file following the existing pattern (`jest.mock('../services/xyz', () => ({ fn: jest.fn()... }))`).
No frontend test suite is configured.

## UI Verification

Do not run Playwright, take screenshots, or launch browsers to verify frontend changes. The user handles all visual UI verification themselves.

## Database Caution

Never mutate the database — simulating a game, advancing a season day, anything that persists
state — without asking the user first. Read-only queries (e.g. Prisma `find*`/`groupBy`/`count`
scripts) are fine without asking. There is no throwaway test DB; the dev database is the user's
real, persistent save. Verify code changes through the Jest suite or code review instead.

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
  - Personnel: `Scout`, `Coach`, `Draft`, `DraftProspect`, `Trade`, `TradeItem`, `Contract`
  - Market: `FreeAgentAuction`, `AuctionBid`
  - Broadcast: `BroadcastCompany`, `BroadcastOffer`, `BroadcastContract`
  - Press: `PressConference`, `BroadcastRelation` (+ `Team.press_audience`)
  - Misc: `NewsItem`, `HomeRunDerbyEvent`, `DerbyEntry`, `DerbySwing`, `HallOfFameCandidate`, `RetiredNumber`

**Routes** (`routes/`) handle HTTP concerns only; business logic lives in **Services** (`services/`). Each route file is mounted at `/api/<name>`:

| Route | Handles |
|---|---|
| `newgame.js` | Creates a new save/franchise |
| `teams.js` | List/detail teams, user's team, league overview |
| `players.js` | Team roster stats, free agents, promote/demote/renew, player stats |
| `stadium.js` | Grandstand sections: pricing, upgrades (max level `GRANDSTAND_MAX_LEVEL` = 15), new builds, floor expansion; team facility upgrades (`POST /facilities/:key/upgrade`) |
| `season.js` | Season status, start season, advance day, schedule |
| `games.js` | Single game detail + simulate |
| `finances.js` | Team finance ledger |
| `scouts.js` | Scouts: list/hire, assign, collect scouting reports |
| `auctions.js` | Free agent auctions: list/detail/bid |
| `lineup.js` | Get/set the team's lineup |
| `broadcast.js` | Broadcast offers in the price war (accept = sign now / reject), user TV+radio contracts, companies (money, season earnings, reputation tier) |
| `playoffs.js` | Bracket view, simulate a series game, simulate/advance a round |
| `coaches.js` | Hire/fire coaches, assign to a player |
| `draft.js` | Current draft pool, advance CPU picks, user pick |
| `news.js` | League news feed |
| `history.js` | Champions, past seasons, all-time stats/recalculation, Hall of Fame (`/hall-of-fame`: inducted + current ballot), retired numbers (`GET/POST /retired-numbers`) |
| `trades.js` | Sent/received offers, history, create/accept/reject/cancel |
| `derby.js` | Home run derby: list/detail, create entry, simulate |
| `map.js` | League map: cities (team name minus mascot), user team's current city (host of its last finished game this season, else home) and next game (`?gameId=` pins it) |
| `playoffMarket.js` | Playoff market (`/api/playoff-market`): listings of eliminated teams' players, top/my bids, user's incoming/outgoing loans; `POST /:loanId/bid { pct }` |
| `press.js` | Sala de prensa (`/api/press`): overview (audience, satisfaction per broadcaster, pending conference, season history), `GET /:id`, `POST /:id/answer { answers: [{questionId, tone}] }`, `POST /:id/skip` |

**Services** (`services/`):

| Service | Responsibility |
|---|---|
| `gameSimulator.js` | Full game engine: 9+ innings, up to 15 max, lineup cycling |
| `atBatSimulator.js` | At-bat outcomes weighted by batter vs. pitcher skill |
| `scheduleGenerator.js` | Conference-only schedule (`DIVISION_CONFERENCES`, Oeste/Este, 12 teams each): 15 rounds per leg (11 of the round-robin + 4 against the own division), two legs with home/away flipped, 3 games per series = 90 games per team |
| `auctionService.js` | Free agent auctions; CPU teams bid with randomized aggressiveness (0.05–0.25) |
| `economy.js` | Home game revenue: demand (4–14% of fan_base regular season, 14–25% playoffs) split across grandstands by capacity × ring premium (`TICKET_RING_PREMIUM`, ring 1 = next to the field, via `ringOf()` in `stadiumGenerator.js`), each scaled by `priceDemandFactor(price, sectionFairPrice)` (team fair price = `TICKET_FAIR_PRICE_*` + reputation (linear to 100, sqrt above) + facility `fair_price_per_level`, × ring premium; up to +30% below it, exponential drop above it) and capped at section capacity, overflow buyers spilling to sections with room, × that section's ticket price + merch (1–5% of fan_base × $20–50/fan) − operating cost (per attendee, $0.5 → $10 on an accelerated curve that caps at 1M attendance; `STADIUM_MAINTENANCE_*` in `config.js`); away games earn merch only. Optional `facilityBonuses` arg (user team) adds attendance rate, scales merch and adds facility upkeep |
| `lineup.js` | Converts DB roster to ordered lineup array |
| `gamePlay.js` | Orchestrates a single game: builds lineups, runs `gameSimulator`, applies injuries, updates standings/fan base, persists results |
| `reputationService.js` | `clampReputation()` to [`REPUTATION_MIN`, `REPUTATION_MAX`] = [1, 10 000]. Reputation is cumulative and only changes on season results: +5 playoff qualify / +10 semis / +15 final / +20 champion (`playoffService.js`), −`REPUTATION_MISSED_PLAYOFFS_PENALTY` (25) for missing playoffs, −15 on loan default (`bankService.js`), +`HOF_INDUCTION_REPUTATION_BONUS` (5) to the primary team of a Hall of Fame inductee (`legacyService.js`). No per-game change |
| `cpuTeamManagement.js` | End-of-season CPU revenue distribution (flat $100–300/fan payout) and CPU roster upkeep: on `ROSTER_CHECK_DAY` every empty MAJOR position is filled — a fresh player is generated if the roster is under `MAX_ROSTER_SIZE`, otherwise the weakest player from a surplus position is released to make room (first-year rookie only as a last resort), with a *forced* release that charges at most the team's available budget and never lets budget go negative. `previewFillMissingPositions()` is the read-only planner behind `scripts/runRosterCheck.js` |
| `playerService.js` | End-of-season skill fluctuation (growth/decline vs. `growth_age`) and annual contract-years decrement |
| `playerInvestmentService.js` | CPU teams spend a budget-derived pool to buy up `current_skill` points on their weakest players, at skill-tiered marginal cost |
| `retiredPlayer.js` | Retires active/free-agent players aged 40+ each season, clearing them from lineups and rosters |
| `injuryService.js` | Post-game injury rolls (age-scaled probability, 3–15 day duration; user team reduced by medical facility level), plus daily recovery countdown |
| `stadiumFacilityService.js` | Team-level stadium facilities (`field` max 10, `lights`/`board`/`medical` max 5; `Team.<key>_level`, all start at 1), defined in `STADIUM_FACILITIES` in `config.js`: upgrade cost, `getFacilityBonuses()` (attendance rate, merch multiplier, injury reduction, per-game upkeep), user-team only |
| `skillCurve.js` | Precomputed `skill^1.5` lookup table exposing `effectiveSkill()`, a convex skill-weighting used across auctions/derby/etc. |
| `coachService.js` | Applies per-specialty coach bonuses (batting/pitching skill bumps, conditioning recovery) to the user's roster and deducts coach salaries |
| `draftService.js` | Draft pool generation (prospects + market rookies/young free agents), CPU auto-picks, and user pick handling |
| `tradeService.js` | Trade offer evaluation/valuation (skill + upside − salary − age risk) and CPU accept/reject logic, deadline-aware |
| `luxuryTaxService.js` | Progressive luxury tax on payroll above the league 75th-percentile threshold, with an inefficiency surcharge based on cost-per-skill vs. league median |
| `playoffService.js` | Playoffs: top 3 per division play a 6-game mini round robin (`round` 0, one 1-game `PlayoffSeries` per game, played in `GROUP_GAME_ORDER`); the top 2 of each go to quarters (cross-division within the conference), then semis and the Oeste vs Este final. Tracks each team's "desperation index" |
| `broadcastService.js` | TV/radio broadcast price war (`BROADCAST_*` in `config.js`). Companies hold `money` (TV $1B, radio $500M) and earn per game `fan_base × ($2–$10 mixed by reputation rank + random)` per contracted team (radio ½, `creditBroadcastEarnings` from `gamePlay`). Opening offers at season start, gated by reputation rank tiers (most expensive companies only offer to the top 3); days 1–10 outbid companies raise their price/fan/game up to 10% of expected earnings, total ≤ 40% of their money. User signs any offer instantly; CPU teams sign the best affordable one on day 10. 1 TV + 1 radio contract per team, up to 10 years, total paid in equal annual parts (company → team) |
| `derbyService.js` | Home Run Derby: swing-by-swing HR probability from batter skill, CPU entrant selection, bracket/tiebreak simulation |
| `contractService.js` | `Contract` table (current + historical). Mirrors `Player.salary`/`contract_years_remaining`/`rookie_contract` — every signing/renewal/trade/release/expiry/retirement calls it. Achievement bonus = 0–3% of annual by `demand_factor` (CPU capped at 1%), paid on no-hitters/perfect games/cycles/multi-HR/season awards with a per-season cap (`ACHIEVEMENT_BONUS_*` in `config.js`). `backfillContracts()` (behind `npm run contracts:backfill`) reconstructs past contracts from `PlayerSeasonRecord`. The player CV (`getPlayerCareerHistory`) shows every contracted season, with zeros when he didn't play |
| `mapService.js` | `cityName()` + `getMapState()` behind `GET /api/map`; travel location is derived from the schedule, nothing persisted |
| `legacyService.js` | Hall of Fame, run at season end after `retireOldPlayers()`: every retiree gets a `HallOfFameCandidate` row with a frozen `legacy_score` (from `PlayerSeasonRecord`, CPU stints ÷ `HISTORICAL_CPU_STAT_DIVISOR`, + award points). Ranked by percentile within role (batter/pitcher) among retirees with `HOF_MIN_SEASONS`+ — no absolute thresholds; top 10% go on the ballot, voted from the next season: ≥75% inducted, <5% or 10 years dropped (`HOF_*` in `config.js`). First run evaluates all historical retirees. Heirs: a new ballot entrant may spawn a son (`Player.parent_id`, `status: 'heir_pending'`, inherited last name/position/potential/skin tone, `HEIR_*`) that `generateToddlerCycle()` injects into the next Toddler cycle (≤ `HEIR_MAX_PER_CYCLE`); CPU teams pick their own legend's heir first |
| `jerseyService.js` | Jersey numbers 0–99 unique per team (`Player.jersey_number` + `jersey_team_id`, copied to the active `Contract.jersey_number`). No hooks on every signing/trade: `syncJerseyNumbers()` (season start, every advance-day, season end, lazily on `GET /teams/user`) reassigns anyone without a number or carrying one from another team — keeps his own if free, heirs prefer their father's, else random from `JERSEY_*_RANGE`. `RetiredNumber`: user retires a retired player's number after `RETIRED_NUMBER_MIN_SEASONS` with the team (fan boost if Hall of Famer); CPU teams auto-retire their own inductee's number (`legacyService`); only the honoree's son may wear it. Shown as banners on the stadium facade |
| `leagueLeadersService.js` | `GET /api/players/league-leaders` for the Dashboard: best batter (AVG) / pitcher (ERA) for the league and the user team, top-5 per category, and live MVP / Cy Young / Rookie of the Year top-3 races. Reuses `qualifyStats()`/`rankRookies()` from `seasonAwardsService.js`, with `SEASON_AWARD_MIN_AB/IP` prorated by regular-season progress |
| `playoffMarketService.js` | Playoff market (`PLAYOFF_MARKET_*` in `config.js`): when the regular season ends, `openPlayoffMarket()` lists every MAJOR player of non-qualified teams (`getQualifiedTeamIds()` in `playoffService.js`) and the bracket waits `PLAYOFF_MARKET_DAYS` advance-days (season status is already `playoffs`, no series yet). Qualified teams bid 50–150% of the player's salary (one-off payment, max 3 per team, must beat your weakest at the position); CPU bids daily on upgrades over its starter; the last day closes without a CPU round. Winners move with `Player.on_loan_from_team_id` (Contract untouched); `returnPlayoffLoans()` sends them back (original jersey restored) first thing in `endOfSeasonCleanup` |
| `pressConferenceService.js` | Template-only press conferences (`PRESS_*` in `config.js`): one every `PRESS_SERIES_INTERVAL` (3) regular-season series, created by `routes/games.js` after the last game of the series (`seriesProgress()` groups the user's games into series), one when each user playoff series (round ≥1) ends, and one when the group stage ends (`maybeCreateAfterGroupStage`, from advance-day / `/playoffs/advance-round`). Hosted by a contracted broadcaster (alternating TV/radio; without contracts only rivalry moves). Answers' tones (`pressTemplates.js`: humilde/confiado/provocador/evasivo) move `Team.press_audience` (season, 0–100), the host's `BroadcastRelation.satisfaction` (persistent) and rivalry (`adjustRivalryIntensity`), and publish a `press` NewsItem. Optional: a pending one is skipped (−audience) when the next user game is played or at season end. `settlePressSeason()` (first in `endOfSeasonCleanup`) pays each active contract `annual_payment × 15% × (audience−50)/50`, resets audience, decays satisfaction toward 50; `broadcastService.applySatisfactionToOffer()` adjusts the user's renewal offers (±10% price, +1 year from 75, no offer below 20) |
| `pressTemplates.js` | Pure question/answer/headline template bank for press conferences, context-tagged (series result, playoffs, rivalry, streaks, standings, feats, injuries, trade deadline) |
| `aiService.js` | Text AI via OpenRouter (`OPENROUTER_API_KEY` in `backend/.env`; optional). `generateText()` tries `AI_PRIMARY_MODEL` (DeepSeek V4.1 Flash, paid) then `AI_FALLBACK_MODEL` (Nemotron free), returns `null` on failure so callers fall back to templates; never throws. Reasoning disabled, per-season spend cap `AI_SEASON_BUDGET_USD` (in memory only) skips the paid model. Disabled under Jest unless `AI_ENABLE_IN_TESTS=1`. `scripts/aiSmokeTest.js` = manual live check. AI only writes text, never decides mechanics |
| `pressAi.js` | AI layer for press conferences (`PRESS_AI_ENABLED`): conferences are created with templates and rewritten in the background (`enrichConference`, only while still pending) in the host broadcaster's voice (style from company id, mood from satisfaction); tones/mood/effects stay from templates. Each question is accepted whole or kept as template (validation rejects altered proper names, e.g. "del" for "de"). AI headline on answer (8 s timeout), else `pressHeadline()` |
| `newsService.js` | Thin wrapper that creates `NewsItem` rows, used by other services to log league events |
| `newsDetection.js` | Scans a simulated game's play-by-play for feats (no-hitters/perfect games, cycles, multi-HR games, extra-innings, win/loss streaks) to feed the news feed |

### Frontend (`frontend/src/`)

- **`App.jsx`** — React Router v6 route definitions; 22 top-level routes plus `/game/:id` and `/derby/:id`
- **`api.js`** — Thin fetch wrapper used by all pages (no axios/react-query); one flat `api` object grouped by feature (teams, players, stadium, season, games, finances, scouts, lineup, auctions, playoffs, coaches, draft, news, history, broadcast, trades, derby)
- **`pages/`** — 23 files: `NewGame`, `Dashboard`, `Roster`, `Rookie`, `Market`, `Stars`, `Trades`, `Stadium`, `Scouts`, `Finances`, `TeamsOverview`, `Schedule`, `Lineup`, `Broadcast`, `Playoffs`, `Coaches`, `Draft`, `News`, `History`, `GameView`, `Derby`, `DerbyView`, `PressRoom` (`/press`, Sala de prensa), and `AllTimePlayers` (rendered as a tab inside `History`, not its own route)
- **`map/`** — PixiJS 7 league map (`geometry.js` pins each league city in `ANCHORS` by division and name, unknown cities hash to a spot, on a fixed fictional continent, `MapScene.js`, `LeagueMap.jsx` for the `/map` page, `TravelOverlay.jsx`). After "Avanzar Día" lands on a user game, `advanceDayFlow.js` navigates with `state.travel` and `GameView` shows the overlay (flight from the current city, or "Play Ball" if already there) before `GameIntro`
- **`stadium/`** — PixiJS 7 top-down stadium view (`geometry.js`, `builders.js`, `StadiumScene.js`, `StadiumView.jsx`), lazy-loaded as the "Vista" tab of `Stadium`; every grid section is drawn as a wedge of a bowl around the field (one ring per floor, `layoutSections()` in `geometry.js`) with its own level look; facilities drawn from their levels
- **`components/`** — Shared UI: `Navbar`, `Leaderboard`, `StadiumGrid`, `SectionModal`, `Pagination`, `TeamBadge`, `BroadcastLogo` (SVGs in `assets/broadcast/`, matched by slugified company name), `SkillTierBadge`, `FavoriteButton`

Styling is Tailwind CSS v3 with no component library.

### Database / Environment

Requires a PostgreSQL instance. Copy `backend/.env.example` to `backend/.env` and set `DATABASE_URL`. Run `npm run seed` once after a fresh DB to populate all game data.

### Key Design Decisions

- User team is always `id = 1` (set in `config.js`). All "user team" queries filter by this constant.
- Game simulation is stateless: `gameSimulator.js` computes the full game result in memory and persists events to `GameEvent` in bulk.
- CPU teams in auctions bid automatically when the user advances a season day; no real-time loop.
- Stadium sections are pre-seeded (not user-created); upgrades increase capacity/level on existing rows, capped at level 15. Facilities (field/lights/board/medical) are separate team-level columns, not sections.
- CPU teams get a flat end-of-season revenue payout (`cpuTeamManagement.js`, $100–300/fan, from `CPU_REVENUE_PER_FAN_MIN`/`CPU_REVENUE_PER_FAN_MAX` in `config.js`) separate from the per-game attendance/ticket/merch formula in `economy.js` — don't conflate the two when touching economy code.
- Playoff seeding/desperation index is tracked per-team directly on the `Team` model (`desperation_index`, `min_growth_threshold`), not a separate table.
