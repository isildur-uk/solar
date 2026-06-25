# Registry on the desktop (Tauri) — SQLite persistence

The Registry web app and the desktop app share the **same core** (`registry/core/*`)
and the **same repository interface**. Only the storage driver differs:

| Build | Repository | Persistence |
|-------|------------|-------------|
| Web (`index.html`) | `RegistryRepository.createRepository()` | IndexedDB (browser) / in-memory (Node tests) |
| Desktop (Tauri) | `createSqliteRepository(makeTauriDriver(db))` | SQLite file via `@tauri-apps/plugin-sql` |

## Wiring (desktop entry, runs before `app.js`)

```js
import Database from "@tauri-apps/plugin-sql";
import { makeTauriDriver } from "./core/sqlite-driver-tauri.js";
import { createSqliteRepository } from "./core/repository-sqlite.js";

const db = await Database.load("sqlite:registry.db");      // app-data dir
window.RegistryDesktopRepo = createSqliteRepository(makeTauriDriver(db));
```

`app.js` checks `window.RegistryDesktopRepo` first and uses it if present, otherwise
falls back to the web repository. No other app code changes.

## Tauri setup (one-time)
- Add the SQL plugin: `cargo add tauri-plugin-sql --features sqlite` and register it in `src-tauri/src/lib.rs`.
- JS dep: `npm i @tauri-apps/plugin-sql`.
- Permission (capabilities): allow `sql:default` (and `sql:allow-execute` / `sql:allow-select`).

## Schema
`repository-sqlite.js` creates, if absent:
```sql
CREATE TABLE intelligence_reports (urn TEXT PRIMARY KEY, updated_at TEXT, json TEXT NOT NULL);
CREATE INDEX idx_intelligence_reports_updated ON intelligence_reports (updated_at);
```
Each IR is stored as one JSON row. All queries are parameterised (the placeholder
`?` is translated to Tauri's `$n`), verified injection-safe in `tests/sqlite.run.js`.

## Verification status
- SQL logic is tested against **real SQLite** (`node:sqlite`) in `tests/sqlite.run.js` (save/get/list/search/remove, JSON round-trip, upsert, injection-safety, parity with the in-memory repo).
- The actual Tauri packaging/run is **not** exercised in CI here — it requires the Rust/Tauri toolchain. Treat the wiring above as the integration step to run on a desktop dev machine.
