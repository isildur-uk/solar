# 013 — Rename user-facing "Chart Room" → "Solar" (cleanup)

- **Finding**: [CONTENT/BRAND] The product was working-titled "Chart Room" and renamed to **Solar** (DESIGN.md §"Solar: a browser-based link-analysis…", and BRIEF.md). Several user-facing strings still say "Chart Room" — error toasts, an auto-draft disclaimer, a file-validation reason, the main README tagline, and this backlog's own header.
- **Written against HEAD**: a75f64c  ← executor checks for drift.
- **Dimension**: Content / Brand   **Effort**: S   **Risk**: LOW
- **Depends on**: none.

## Why this matters
The demo is shown to a senior, NCA-literate audience where credibility is the bar (DESIGN.md). A retired working title leaking into a load-failure toast or an auto-drafted document disclaimer reads as unfinished. Consistency of the product name across every surface the analyst can see is the minimum bar for a showcase piece. Scope is deliberately narrow: **user-facing strings and docs only — do NOT rename code identifiers, variables, function names, or file names.**

## Current state (evidence)
User-facing occurrences (verified at HEAD a75f64c):
- `js/ui/dragdrop.js:241` — error toast:
  ```js
  status("Case load failed: not a valid Chart Room file");
  ```
- `js/ui/app.js:285` — error toast:
  ```js
  status("Load failed: not a Chart Room case file");
  ```
- `js/core/disclosure.js:15` — auto-draft disclaimer shown on drafted documents:
  ```js
  var CAVEAT = "Auto-drafted by Chart Room — verify before dissemination.";
  ```
- `js/core/fileread.js:178` — validation reason surfaced to the user:
  ```js
  return { kind: "unsupported", name: name, reason: "JSON is not a Chart Room case" };
  ```
- `README.md:2` — product tagline:
  ```
  *(formerly Chart Room — a connections map looks like a solar system)*
  ```
- `plans/README.md:1` — this backlog's header:
  ```
  # Chart Room (SOLAR) — design-fix backlog
  ```

Intentional historical / internal notes (leave as-is, they are not user-facing):
- `plans/009-widescreen-density.md:54` — a decision note ("If Chart Room prefers to keep the placeholder…").
- Anything under `test_ingest/` and `INGEST-MAPPING-SPEC` — internal test/spec docs.

## Target state
Every **user-facing** occurrence reads "Solar". The `README.md:2` tagline keeps the "formerly" framing but reworded so the current name is Solar. This backlog header is renamed. Code identifiers are untouched.

- `js/ui/dragdrop.js:241` → `status("Case load failed: not a valid Solar file");`
- `js/ui/app.js:285` → `status("Load failed: not a Solar case file");`
- `js/core/disclosure.js:15` → `var CAVEAT = "Auto-drafted by Solar — verify before dissemination.";`
- `js/core/fileread.js:178` → `reason: "JSON is not a Solar case"`
- `README.md:2` → keep as a historical aside, e.g. `*(a connections map looks like a solar system)*` — remove the stale "formerly Chart Room" or reword to `*(Solar — a connections map looks like a solar system)*`. Either is acceptable; the goal is that the live product name shown is "Solar".
- `plans/README.md:1` → `# Solar — design-fix backlog`

## Steps (ordered, each independently verifiable)
1. Edit the four JS strings above (`dragdrop.js:241`, `app.js:285`, `disclosure.js:15`, `fileread.js:178`) — replace the literal "Chart Room" inside the quoted string only → verify: `rg -n "Chart Room" js/` → expect: **zero** matches.
2. Edit `README.md:2` per Target → verify: `rg -n "Chart Room" README.md` → expect: zero matches.
3. Edit `plans/README.md:1` header to `# Solar — design-fix backlog` → verify: `rg -n "Chart Room" plans/README.md` → expect: zero matches (the `009` decision note lives in a different file and is intentionally kept).
4. Full-repo audit → run: `rg -ri "chart room"` → expect: only `plans/009-widescreen-density.md:54` and internal `test_ingest/` / `INGEST-MAPPING-SPEC` docs remain — **none user-facing**.

## In scope / out of scope
- In: `js/ui/dragdrop.js` (line 241 string), `js/ui/app.js` (line 285 string), `js/core/disclosure.js` (line 15 string), `js/core/fileread.js` (line 178 string), `README.md` (line 2), `plans/README.md` (line 1).
- Out (do not touch): any variable / function / class / file name; `plans/009-widescreen-density.md` (intentional historical note); everything under `test_ingest/`; the `INGEST-MAPPING-SPEC` doc; any `.json` fixture whose schema key literally contains a name (renaming a serialised key would break file loading — if you find one, STOP and report).

## Done criteria (machine-checkable — not "looks better")
- `rg -ri "chart room" js/ README.md plans/README.md` → **zero** matches.
- `rg -ri "chart room"` (whole repo) → matches ONLY in `plans/009-widescreen-density.md` and `test_ingest/` / `INGEST-MAPPING-SPEC` — confirm each remaining hit is a comment/doc, not a string rendered to the user.
- Load a deliberately invalid file in the app → the toast now reads "…not a valid Solar file" / "…not a Solar case file" (screenshot the toast).
- Draft a document → its disclaimer footer reads "Auto-drafted by Solar — verify before dissemination." (screenshot the drafted doc header/footer).

## Escape hatches
- If any "Chart Room" occurrence is inside a **serialised data key** (a JSON property name, a stored case-file field, a schema string that a parser matches on), STOP and report — renaming it would break file compatibility. String **values** shown to the user are safe to change; **keys** are not.
- If `rg` finds a user-facing "Chart Room" NOT in this list, add it to the change and note it in your report — do not silently skip it, and do not rename any code identifier to "fix" it.

## Maintenance note
This is a one-shot cleanup. In review, watch that no new "Chart Room" string is introduced in future copy. The single accent, motion, and colour rules are untouched by this plan.
