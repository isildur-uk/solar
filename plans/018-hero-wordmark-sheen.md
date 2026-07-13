# 018 — One slow sheen pass across the hero SOLAR wordmark

- **Finding**: [MOTION/BRAND] The hero cover wordmark ("SOLAR") has a considered entrance choreography but, once settled, is completely static. A single, very slow violet sheen pass would amplify the cosmic brand on the cover — DESIGN.md explicitly lists "hero sheen" as wanted decoration.
- **Written against HEAD**: a75f64c  ← executor checks for drift.
- **Dimension**: Motion / Brand   **Effort**: S   **Risk**: MED
- **Depends on**: none.

## Why this matters
The SOLAR cover (`hero.html`) is a *separate, deliberate* brand surface (DESIGN.md note: "the `Solar/GFX/DESIGN.md` cover-surface system is a separate, deliberate brand for the SOLAR landing page only"). DESIGN.md, Imagery, names "hero sheen" as permitted brand-atmospheric decoration. A single slow sheen keeps the cover feeling alive without competing with the entrance animation. One effect per surface; violet range only; reduced-motion gated.

## Current state (evidence) — READ THE DISCREPANCY NOTE
The brief described `<h1 class="wordmark">SOLAR</h1>` styled by `hero.html`. **At HEAD a75f64c the reality differs — build against reality:**
- Source (HTML): `hero.html:337`:
  ```html
  <h1 class="wordmark" id="wordmark">SOLAR</h1>
  ```
  (It has BOTH `class="wordmark"` and `id="wordmark"`.)
- Source (CSS): the wordmark's animated element is `#solar-mark .word`, styled in **`css/hero.css:96-109`** (NOT inline in hero.html — hero.html:9 opens a `<style>` block but the wordmark rules live in `css/hero.css`). Confirm which element actually renders "SOLAR": the animated `.word` inside `#solar-mark`, or the `<h1 class="wordmark" id="wordmark">`. Inspect the DOM first (Step 1) — apply the sheen to whichever element paints the visible letters.
  ```css
  #solar-mark .word {
    …
    font-family: var(--sol-font-display);
    font-weight: var(--sol-weight-thin);   /* 300 */
    color: transparent;
    opacity: 0; transform: translateY(14px);
    animation: cr-word-in 1100ms cubic-bezier(0.22, 1, 0.36, 1) 320ms forwards;
    transition: transform 500ms cubic-bezier(0.22, 1, 0.36, 1);
  }
  @keyframes cr-word-in { to { opacity: 1; transform: translateY(0); } }
  ```
  NOTE: `.word` already has `color: transparent` — it is likely painted by a background-clip gradient already (inspect). The sheen must layer onto that existing paint, not fight it.
- Source (reduced-motion guard): `css/hero.css:212-221` — this is the guard that "blankets the wordmark" (the brief said "~322"; it is actually **css/hero.css:214**):
  ```css
  @media (prefers-reduced-motion: reduce) {
    #hero-stars { animation: none; opacity: 1; }
    #solar-mark .word, #solar-mark .bloom { animation: none; opacity: 1; transform: none; }
    …
  }
  ```
- Tokens: hero uses `--sol-*` tokens (e.g. `--sol-font-display`), NOT `--accent`/`--accent-2`. `--accent-2 #b39dff` is defined only in the workbench light-theme block (`css/app.css:776`) and is NOT in scope on the cover. **Do not reference `--accent-2` here** — use the cover's own violet (`--sol-glow` / the cover's periwinkle→violet range). Confirm the exact cover violet token in `css/hero.css` `:root` before writing the gradient (Step 1).

## Target state
Add ONE slow sheen pass to the element that paints "SOLAR", using **text-effects.md #06 "Chromia"** (brushed-metal sheen). The sheen sweeps a bright band across the letters, in the cover's periwinkle→violet range only. Because `.word` already uses `color: transparent` + background-clip, layer the sheen as a very slow, ideally one-shot (or very long-period) pass so it does not loop distractingly.

Recoloured Chromia to the cover violet range (replace `SOLAR_VIOLET` with the confirmed cover token, e.g. `rgb(var(--sol-glow))` or the cover periwinkle):
```css
/* 018 — Chromia sheen, cover violet range only, one very slow pass.
   Layers onto the wordmark's existing background-clip paint. */
#solar-mark .word.sheen {
  background-image: linear-gradient(105deg,
      color-mix(in srgb, SOLAR_VIOLET 40%, transparent) 0 38%,
      SOLAR_VIOLET 47%,
      #fff 50%,
      SOLAR_VIOLET 53%,
      color-mix(in srgb, SOLAR_VIOLET 40%, transparent) 62% 100%
    );
  background-size: 260% 100%;
  -webkit-background-clip: text; background-clip: text;
  animation: solar-sheen 6s ease-in-out 1600ms 1 both;   /* one pass, after the entrance settles */
}
@keyframes solar-sheen {
  0%   { background-position: 130% 0; }
  100% { background-position: -130% 0; }
}
```
- Prefer **one-shot** (`… 1 both`) firing AFTER the entrance (delay ≥ the entrance's total ~1420ms). If a reviewer wants it to recur, make it very slow and infinite instead — but only one of the two.
- **Alternative:** text-effects.md #22 "Limelight" (spotlight sweep) — same constraint (violet range, one slow pass). Pick ONE.

Add the sheen INSIDE the existing reduced-motion guard so it is disabled there too (do not create a second guard):
```css
@media (prefers-reduced-motion: reduce) {
  /* existing rules … */
  #solar-mark .word, #solar-mark .word.sheen { animation: none; opacity: 1; transform: none; }
}
```

**Do NOT alter the existing entrance choreography** (`cr-word-in`, the translateY, the delay). The sheen is additive — apply it via an extra class (`.sheen`) or a layered rule, not by editing the entrance rule.

## Steps (ordered, each independently verifiable)
1. Inspect the rendered cover DOM → determine which element paints the visible "SOLAR" letters (`#solar-mark .word` vs `<h1 id="wordmark">`) and confirm the exact cover violet token in `css/hero.css` `:root` (e.g. `--sol-glow`). Apply the sheen to the painting element; substitute the real token for `SOLAR_VIOLET`.
2. Add the `.sheen` rule + `@keyframes solar-sheen` to `css/hero.css` and add the `.sheen` class to the wordmark element (or apply the rule directly to `#solar-mark .word` if it does not already own a conflicting `background-image`) → verify: `rg -n "solar-sheen" css/hero.css` → two matches.
3. Extend the existing reduced-motion block (css/hero.css:212-221) to disable the sheen → verify: `rg -n "prefers-reduced-motion" css/hero.css` shows ONE block (not a new second one) that now covers the sheen.
4. Confirm the entrance rule (`cr-word-in`) is unchanged → verify: `git diff css/hero.css` shows the `cr-word-in` keyframe and the `#solar-mark .word { … animation: cr-word-in … }` line are untouched.

## In scope / out of scope
- In: `css/hero.css` (the sheen rule, one keyframe, extend the existing reduced-motion block) and — only if needed — a `sheen` class token on the wordmark element in `hero.html:337`.
- Out (do not touch): the entrance choreography (`cr-word-in`, delays, translateY); `#hero-stars`, `#hero-cover`, `#hero-iris`, `.bloom` animations; the workbench `--accent-2` token (out of scope on the cover); `css/app.css`.

## Done criteria (machine-checkable — not "looks better")
- The `@media (prefers-reduced-motion: reduce)` block in `css/hero.css` disables the sheen keyframe on the wordmark — grep-verifiable, and there is still only ONE such block (`rg -c "prefers-reduced-motion" css/hero.css` → 1).
- The sheen gradient uses only the cover violet range + a white sheen band — NO blue→purple CTA-style gradient, and NO `--accent-2`/workbench token → `rg -n "accent-2" css/hero.css` → zero.
- The entrance keyframe `cr-word-in` is byte-for-byte unchanged (`git diff` shows no edit to that rule).
- Visual check: load the cover → the wordmark performs its usual entrance, THEN a single bright band sweeps across "SOLAR" once (or very slowly if infinite). Colour stays in the periwinkle/violet range. With reduce-motion ON → no entrance motion AND no sheen; the wordmark is fully visible and static.

## Escape hatches
- If neither `#solar-mark .word` nor `<h1 id="wordmark">` clearly paints the letters (e.g. the text is an SVG or image), STOP and report — do not bolt a text-clip sheen onto a non-text element.
- If applying a `background-image` sheen overrides an existing background-clip paint and makes the wordmark disappear, STOP and report — the sheen must layer onto existing paint, not replace a gradient that is doing the base colour. Do not hardcode a fallback colour to paper over it.
- If the cover has no violet token in `:root`, STOP and report — do NOT import the workbench `--accent-2`; the cover is a separate brand surface.

## Maintenance note
One effect per surface: the sheen is the ONLY added motion on the wordmark — do not also add a glow pulse. Keep it one-shot or very slow so it never competes with the entrance. If the cover's violet token is renamed, update the sheen gradient to match.
