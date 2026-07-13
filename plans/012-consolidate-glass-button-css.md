# 012 — Delete two dead glass-button blocks; keep the one that wins

- **Finding**: [CLEANUP] The liquid-glass toolbar-button rule is defined THREE times in `css/redesign.css`. Because CSS cascades by source order, only the LAST block renders; the earlier two are dead — roughly as much dead CSS as the live rule. Consolidate to one.
- **Written against commit**: 951a0c2
- **Dimension**: Cleanup / Maintainability   **Effort**: M   **Risk**: MED
- **Depends on**: none. (Sequencing note: if plan 011 runs first and applies a cut to the winning block, do 011 first — this plan preserves whatever the winning block currently says.)

## Why this matters
Three definitions of the same `.btn` styling mean any future change risks being edited in a superseded block and silently doing nothing — a classic maintenance trap that wastes reviewer and executor time. The principle is *one source of truth per component*. The rendered button already comes entirely from the third block; deleting the first two changes nothing visually and makes the file honest.

## Current state (evidence)
Three blocks, each redefining `.btn` (and `details.menu > summary`), each superseding the last by source order:

- **Block 1 (dead) — `css/redesign.css:103-141`**: the original "heavy-bevel" glass. Includes a `.btn::before` with the liquid-glass filter:
  ```css
  .btn {
    position: relative; isolation: isolate;
    /* … heavy inset box-shadow bevel … */
  }
  .btn::before {
    content: ""; position: absolute; inset: 0; z-index: -1; border-radius: inherit;
    pointer-events: none;
    -webkit-backdrop-filter: blur(2px); backdrop-filter: url(#liquid-glass) blur(1px);
  }
  .btn:hover { … }  .btn:active { … }  .btn.primary { … }  .btn.danger:hover { … }  .btn:disabled { opacity: 0.4; }
  ```
- **Block 2 (dead) — `css/redesign.css:259-335`**: the "refined specular sheen" glass. Its own header comment literally says *"Appended = wins on source order"* — but it is then itself superseded by block 3. Redefines `.btn`, `.btn::before` (a sheen, not the filter), hover/active/focus-visible/primary/`[open]`/danger/disabled.
- **Block 3 (WINNER — `css/redesign.css:342-368`)**: the "V2 liquid-glass — theme-driven fill + grain + per-button cursor spotlight" block. This is what actually renders. It redefines `.btn`/`summary` with `background:var(--glass-fill)`, `backdrop-filter:blur(12px) saturate(1.2)` (:347), a noise-SVG `::before` (:352-354, **no** `url(#liquid-glass)`), a specular `::after` (:355-356), hover/active/focus/primary/`[open]`/danger/disabled, and flattens dropdown items (:366-367):
  ```css
  .btn, details.menu > summary{
    position:relative; isolation:isolate; overflow:hidden; border-radius:9px;
    border:1px solid var(--glass-border); color:var(--btn-text);
    background:var(--glass-fill);
    -webkit-backdrop-filter:blur(12px) saturate(1.2); backdrop-filter:blur(12px) saturate(1.2);
    box-shadow:var(--glass-shadow); --mx:50%; --my:0%;
    transition:color .18s ease, border-color .18s ease, transform .16s ease, box-shadow .2s ease;
  }
  /* … ::before noise, ::after specular, hover/active/focus/primary/[open]/danger/disabled … */
  ```

**Verified consequence:** because block 3 redefines `.btn::before` (:352-354), block 1's `.btn::before` with `url(#liquid-glass)` (:124) never renders. Deleting blocks 1 and 2 removes only styling that is already fully overridden.

## Target state
One glass-button definition — block 3 (`:342-368`) — remains. Blocks 1 (`:103-141`) and 2 (`:259-335`) are deleted, including their block-header comments. The rendered button is byte-for-byte visually identical.

Before deleting, confirm block 3 covers every state that blocks 1/2 covered so nothing is lost:
- base `.btn` / `summary` — block 3 :342-350 ✓
- `::before` — block 3 :352-354 ✓ (grain, supersedes both earlier `::before`s)
- `::after` specular — block 3 :355-356 ✓
- `:hover` — :357 ✓  · `:active` — :358 ✓  · `:focus-visible` — :359 ✓
- `.primary` (+ `::after`, `:hover`) — :360-362 ✓
- `details.menu[open] > summary` — :363 ✓
- `.danger:hover` — :364 ✓  · `:disabled` — :365 ✓
- dropdown-item flattening — :366-367 ✓
Any state present ONLY in a deleted block (grep before you cut) must be re-checked — see step 2.

## Steps (ordered, each independently verifiable)
1. Snapshot the rendered button first → screenshot the workbench toolbar (a normal `.btn`, a `.primary`, an open `details.menu` summary, a `.danger` on hover, a `:disabled`) at desktop. This is the visual-diff baseline.
2. Diff the state coverage → run: `rg -n "\.btn(:|\.|,| |\{)|details\.menu" css/redesign.css` across the three block ranges and confirm every selector/state in blocks 1 (:103-141) and 2 (:259-335) has an equivalent in block 3 (:342-368). If a state exists ONLY in a deleted block, STOP and report — do not delete it blind.
3. Delete block 2 (`css/redesign.css:259-335`) including its `/* === … === */` header comment.
4. Delete block 1 (`css/redesign.css:103-141`) including its `/* buttons mimic the hero ENTER … */` header comment. Leave the `/* accent now themed … */` note at :100 and the surrounding non-button rules intact.
5. Verify only one `.btn` base definition remains → run: `rg -n "^\.btn, details\.menu > summary\{|^\.btn \{|^\.btn\{" css/redesign.css` → expect: the single block-3 base rule (and no other `.btn {` base opener from the deleted blocks).
6. Reload the workbench and re-screenshot the same five button states.

## In scope / out of scope
- In: `css/redesign.css` — deletion of lines 103-141 and 259-335 (plus their header comments) only.
- Out (do not touch): block 3 (`:342-368`) — the winner stays exactly as-is (unless plan 011 has already edited it; then preserve 011's version); the `#liquid-glass` SVG filter in `index.html:399` (harmless, may still be referenced by hero.html — do NOT remove it here); `.menu-pop`/`details.menu` layout rules (`:143-167`) that are not part of the button-visual blocks; every other CSS file.

## Done criteria (machine-checkable — not "looks better")
- `css/redesign.css` contains exactly ONE base `.btn`/`summary` glass definition (the block-3 opener). `rg -c "backdrop-filter" css/redesign.css` drops by the count that lived in the deleted blocks (block 1 had the `url(#liquid-glass)` line; block 2 had none on `.btn` base but block 1 did — confirm the remaining backdrop-filter references are only block 3's + `.menu-pop`).
- `rg -n "url\(#liquid-glass\)" css/redesign.css` → NO matches (it lived only in the deleted block 1; the SVG filter in index.html stays for hero.html).
- File is shorter by ~113 lines (39 + 77 + comments), and no selector that rendered before now renders differently.
- Visual diff: the five button-state screenshots (normal, primary, open menu, danger-hover, disabled) are pixel-identical before vs after. If ANY differ, a state was lost — revert and report which.
- Page still loads with no CSS console errors; toolbar buttons look and behave unchanged.

## Escape hatches
- If step 2 finds a selector/state present only in a deleted block (something block 3 does not cover), STOP and report it — do not delete that state; the consolidation must be loss-free.
- If removing block 1 changes the rendered `::before` (it should not, block 3 redefines it), the override assumption is wrong for this build — revert and report.
- Do NOT remove the `#liquid-glass` `<filter>` from `index.html` — `hero.html` references it (`hero.html:184,356`); removing it would break the hero even though the workbench no longer uses it.

## Maintenance note
After this, `.btn` glass lives in exactly one place (block 3). Any future button-style change goes there; if you ever find yourself appending a fourth `.btn` block "to win on source order", edit block 3 instead. Leave a one-line comment at the top of block 3 noting it is the single source of truth for glass buttons.
