# 001 — Ratify periwinkle `#8ea2ff` as the accent of record; retire the "lime" documentation

- **Finding**: [ACCENT/CONTRACT] The shipped accent is periwinkle `#8ea2ff` everywhere in code, but DESIGN.md still declares chartreuse `#ebfc72`, ~30 comments still say "lime", and one orphan inline `#ebfc72` survives in the charting markup. Documentation contradicts the running product.
- **Written against commit**: 951a0c2  ← executor: run `git rev-parse --short HEAD`; if it differs, re-verify every line number below before editing.
- **Dimension**: Colour / design-system contract   **Effort**: M   **Risk**: LOW
- **Depends on**: none. **Do this first — plans 004 and 005 assume the accent is settled.**

## Why this matters
The design contract (DESIGN.md) is the binding source of truth every future UI agent reads before touching the interface. Right now it names an accent (`#ebfc72` chartreuse) that the product does not use — so the very next agent that "obeys DESIGN.md" would re-introduce chartreuse and undo the shipped periwinkle. This is a documentation/cleanup reconcile to make the written contract match the ratified, shipped reality (**cosmic periwinkle `#8ea2ff`**, ratified 2026-07-13). It is **NOT** a re-theme: no rendered colour should change except the single orphan swatch below, which is currently the *only* place chartreuse still renders in the app.

## Current state (evidence)

**1. Code already ships periwinkle (do not change these — they are correct):**
- `css/app.css:17` — `  --accent: #8ea2ff;`
- `registry/styles.css:23` — `  --accent:#8ea2ff; --accent-dim:#6f7fe0; --accent-soft:rgba(142,162,255,0.14);`
- `hero.html:28` — `  --accent: #8ea2ff;`

**2. DESIGN.md still declares chartreuse** — `../DESIGN.md` (one level up, outside the Solar git repo: `C:\Users\44752\Documents\Claude\Projects\Intel\Create Charting Software\DESIGN.md`):
- Line 15: `Accent colour:    chartreuse #ebfc72 — action / selection only (one accent, used sparingly)`
- Line 24: `# Tokens reconciled to shipped css/app.css :root on 2026-06-24 (Inter + Geist Mono, #ebfc72, #0c0c0b, --radius 4px).`
- Line 30: `...Reuse #0c0c0b ground + #ebfc72 accent, 4px corners...`

**3. The `--sol-amber` token is both mislabelled AND carries a stale comment** — `css/tokens.css:33`:
```css
  --sol-amber:       #8ea2ff;   /* the horizon glow — our brand accent */
```
The name says "amber", the value is periwinkle-blue. (Note `css/tokens.css:32` `--sol-signal: #2563eb;` is a *separate* functional focus-only blue — leave it alone.)

**4. The one orphan inline chartreuse that still RENDERS** — `index.html:215`:
```html
          <input type="checkbox" id="rv-link-orphans" style="accent-color:#ebfc72"> link orphans to subject
```

**5. ~30 stale "lime" / "blue-purple" comments** (mislabel the real value; no colour effect). Confirmed occurrences to correct:
- `css/app.css:3` (`single lime accent`), `css/app.css:768` (`dark (blue/purple, default)`)
- `css/redesign.css:3, 54, 99, 102, 256, 302, 323` (all say "lime")
- `registry/styles.css:2, 6, 19, 85, 98, 133, 210` (all say "lime")
- `css/hero.css:3` (`an lime`)
- `hero.html:150, 214, 237` (`brand lime` / `lime hover`)
- `js/ui/analytics.js:3` (`one hero accent (lime)`)
- `js/ui/solar.js:168` (`the accent is fixed (lime)`)
- `js/ui/theme.js:2` (`Dark (blue/purple, default)`)

**6. The chartreuse `_designshots` (superseded lime build previews)** — these are standalone preview/lab files, NOT loaded by the app:
- `_glass_lab.html:9` — `--accent:#ebfc72; --accent-dim:#bacd31;`
- `_button_preview.html:10` — `--accent:#ebfc72; --accent-dim:#bacd31;`

## Target state
- DESIGN.md names `#8ea2ff` as the accent, with a one-line note that lime is retired and cosmic periwinkle is ratified.
- `--sol-amber` renamed to a value-honest token name, all references updated, comment corrected.
- The `index.html:215` orphan uses the token, not a raw hex: `accent-color:var(--accent)`.
- Every "lime" / "blue-purple/blue→purple" comment that describes *the accent* reads "periwinkle" (or "cosmic periwinkle").
- The two `_designshots` are clearly labelled as the superseded lime build (a top-of-file comment), so no one mistakes them for the current palette.

Concrete edits:

**DESIGN.md (`../DESIGN.md`)** — line 15:
```
Accent colour:    cosmic periwinkle #8ea2ff — action / selection only (one accent, used sparingly)
                  # lime #ebfc72 retired; cosmic periwinkle ratified 2026-07-13 (matches shipped css/app.css :root)
```
Line 24 — change `#ebfc72` to `#8ea2ff`. Line 30 — change `#ebfc72 accent` to `#8ea2ff accent`.

**`css/tokens.css:33`** — rename token + fix comment:
```css
  --sol-accent:      #8ea2ff;   /* cosmic periwinkle — the horizon glow / brand accent */
```
Then update every other reference to `--sol-amber` (see step 3) to `--sol-accent`.

**`index.html:215`**:
```html
          <input type="checkbox" id="rv-link-orphans" style="accent-color:var(--accent)"> link orphans to subject
```

**Comments**: replace the word "lime" with "periwinkle" (or "cosmic periwinkle" where "lime" was the accent name), and "blue/purple" / "blue→purple" *only where it labels the accent*, in the files at the lines listed in evidence item 5. Do not alter any code — comment text only.

**`_glass_lab.html` and `_button_preview.html`** — add a top-of-`<style>` (or top-of-file) comment:
```css
/* SUPERSEDED — chartreuse "lime" build preview. The shipped accent is cosmic
   periwinkle #8ea2ff (see css/app.css :root). Kept as a historical designshot only. */
```

## Steps (ordered, each independently verifiable)
1. Edit `../DESIGN.md` lines 15, 24, 30 as above → verify: `grep -n "8ea2ff" "../DESIGN.md"` → expect at least the 3 edited lines; `grep -n "ebfc72" "../DESIGN.md"` → expect only the historical-note line (the `# lime … retired` comment), nothing declaring it as the token.
2. In `css/tokens.css`, rename `--sol-amber` → `--sol-accent` and fix its comment (line 33) → then `grep -rn "sol-amber" .` (exclude node_modules) → expect **zero** hits. Update every hit you find first.
3. Edit `index.html:215` raw hex → `var(--accent)` → verify: `grep -n "ebfc72" index.html` → expect **no** match.
4. Replace "lime"/"blue-purple" accent-labels in the comment lines listed in evidence item 5 → verify: `grep -rniI "lime" --include=*.css --include=*.html --include=*.js . | grep -v node_modules | grep -v wink-bundle | grep -v vis-network | grep -v _glass_lab | grep -v _button_preview` → expect only historical-note lines, if any.
5. Add the "SUPERSEDED" banner comment to `_glass_lab.html` and `_button_preview.html`.
6. Grep the whole tree for any remaining rendered chartreuse: `grep -rn "ebfc72" . | grep -v node_modules` → expect matches ONLY in `_glass_lab.html`, `_button_preview.html`, `_glass_lab_v2_blue.html`, `_theme_preview.html` (the designshots) and the DESIGN.md historical note. **No** match in `index.html`, `hero.html`, or any file under `css/`, `js/`, or `registry/` that the app loads.

## In scope / out of scope
- **In**: `../DESIGN.md`, `css/tokens.css`, `index.html` (line 215 only), the comment lines in evidence item 5, and the two designshot files (`_glass_lab.html`, `_button_preview.html`) — banner comment only.
- **Out (do not touch)**: `css/tokens.css:32` `--sol-signal:#2563eb` (a distinct functional focus blue, not the accent). The `_glass_lab_v2_blue.html` / `_theme_preview.html` files (already blue/purple experiments — leave as-is beyond noting them historically if you wish). Any `rgba(142,162,255,…)` values (these ARE periwinkle already — do not "simplify" them to a token unless trivially safe). The light-theme olive `--accent:#6b7a2f` (`css/app.css:787`, `registry/styles.css:781`) is the deliberate light-mode accent — **not** in scope here.

## Done criteria (machine-checkable — not "looks better")
- `grep -rn "ebfc72" . | grep -v node_modules` returns hits ONLY in the designshot files and the DESIGN.md historical note; nothing in `index.html`/`hero.html`/`css/`/`js/`/`registry/` app-loaded files.
- `grep -rn "sol-amber" . | grep -v node_modules` → zero hits.
- `../DESIGN.md` line 15 contains `#8ea2ff`; no line declares `#ebfc72` as the accent token.
- Visual check: load `index.html`, open Paste Text → Extract, and inspect the "link orphans to subject" checkbox in the review modal footer — the checkbox tick is periwinkle, not chartreuse. Nothing else visibly changes colour.

## Escape hatches
- If `--accent` is not defined in scope at `index.html:215` (it is defined in `css/app.css:17`, loaded before the markup renders — it will be), STOP and report rather than inventing a fallback hex.
- If renaming `--sol-amber` reveals a reference you cannot locate the definition for, STOP and report — do not leave a dangling token.

## Maintenance note
After this, any future accent change is a single edit to `--accent` (dark) + the `html[data-theme="light"]` override + `--sol-accent`. Reviewers should reject any new raw `#ebfc72` or any comment reintroducing "lime" as the accent name. DESIGN.md line 15 is now the authority.
