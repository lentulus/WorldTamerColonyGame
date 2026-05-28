# WorldTamer

A single-user desktop web application for running a colonial economy simulation based on the rules in *World Tamer's Handbook* (TNE 0311, GDW 1994).

The player acts as colony governor, making monthly allocation decisions. The server resolves dice rolls, applies the rules, and maintains a complete turn-by-turn history.

---

## What it simulates

The game follows the WTH monthly turn cycle:

1. **Events and Politics** — weather roll, random events, political table
2. **Output Rolls** — D20 per sector with accumulated modifiers
3. **Rations** — allocate agricultural output to population, stockpile, and export
4. **Energy** — power capacity check against sector demand
5. **Raw Materials** — allocate materials output to industry, agriculture, stockpile, and export
6. **Industrial Output** — allocate credits to new capital, housing, consumer goods, and armed forces
7. **Capital and Labor** — apply new capital, deduct maintenance, reassign workers
8. **Off-World Trade** — *(planned)*

Three satisfaction indices — Standard of Nutrition, Standard of Shelter, Standard of Living — feed back into the following month's output rolls and political stability.

Planet data (star type, axial tilt, atmosphere, orbital period, resource richness) is drawn from the Meridian star database at colony founding and shapes the simulation throughout: seasonal agricultural cycles, weather severity, and acclimatization penalties all vary by world.

---

## Technology

| Layer | Technology |
|---|---|
| Server | TypeScript, [Hono](https://hono.dev), Node.js (port 3001) |
| Colony database | SQLite via `node:sqlite` (built into Node 22+) |
| Star/planet data | DuckDB reading Meridian parquet files (read-only) |
| Client | TypeScript, Vite (port 5173) |
| Shared types | `packages/shared` (pnpm workspace) |
| Package manager | pnpm workspaces |

---

## Prerequisites

- Node.js 22 or later
- pnpm
- The Meridian parquet dataset at a known path (see `.env.example`)

---

## Setup

```bash
git clone <repo>
cd WorldTamer
cp .env.example .env        # edit paths to match your system
pnpm install
pnpm dev                    # starts server on :3001 and client on :5173
```

Open `http://localhost:5173` in your browser.

The colony SQLite database is created automatically at the path in `COLONY_DB` on first startup. All WTH reference tables (sector yields by tech level, satisfaction bands, political table, random events) are seeded at the same time.

---

## Environment variables

| Variable | Description | Default |
|---|---|---|
| `PORT` | Server port | `3001` |
| `MERIDIAN_DATA` | Path to the Meridian parquet directory | `/Volumes/Lexar/MeridianData` |
| `COLONY_DB` | Path for the colony SQLite database file | `/Users/lentulus/databases/worldtamer.db` |

---

## Project structure

```
WorldTamer/
├── client/src/          TypeScript browser client (Vite)
├── packages/shared/     Shared TypeScript types (server + client)
├── server/src/
│   ├── db/              SQLite and DuckDB access
│   ├── engine/          Pure turn-resolution functions
│   └── routes/          Hono API routes
└── supporting/
    ├── docs/            Design documents and execution checklist
    └── sql/             Schema, seed data, and migrations
```

---

## Running tests

```bash
pnpm test                  # all workspaces
pnpm --filter server test  # server only
```

---

## Development notes

- The colony database file (`.db`) is gitignored. Schema and seed SQL are committed and reapplied on startup.
- Meridian parquet files are read-only and never written to.
- Working procedure (test-first, approval gates, design before code) is documented in [PROCEDURE.md](PROCEDURE.md).
- Design decisions and build sequence are in [supporting/docs/ColonySimDesign.md](supporting/docs/ColonySimDesign.md).

---

## License

MIT — see [LICENSE](LICENSE).
