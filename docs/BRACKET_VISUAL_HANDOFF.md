# Bracket visual handoff

## Scope

Current work is focused on the leaderboard web app bracket only. Telegram `/jatkokaavio` should be handled after the web SVG looks right.

## Goal

Make the playoff bracket read like a polished circular knockout tree, closer to the provided reference images:

- teams arranged around an even outer circle
- visible pair branches instead of long straight spokes
- junction dots at each merge point
- clearer center trophy/champion area
- readable labels and flags around the perimeter

## Chosen approach

Use native SVG geometry, not generated bitmap art, for the web app. SVG gives sharper rendering, responsive sizing, exact control over branch paths, and a shared layout model that can later feed the Telegram PNG renderer.

## Files involved

- `lib/bracket-geometry.ts`
  - Shared layout builder.
  - Now should expose richer web drawing primitives: `paths` for curved branches/connectors and `dots` for team/junction/winner nodes.
  - Keep the existing `lines` field for the old Telegram renderer until `/jatkokaavio` is redesigned.

- `components/PlayoffBracket.tsx`
  - Web SVG renderer for `/leaderboard`.
  - Should render `paths` and `dots`, place flags and labels around the outside, and keep country names readable without rotating them around the circle.

- `lib/telegram/bracket-image.tsx`
  - Not part of this phase.
  - Later: port the final web geometry/style into Satori-compatible SVG/JSX.

## Verification checklist

- Run `npm run build`.
- Open `/leaderboard` with knockout matches present.
- Check desktop and mobile widths.
- Confirm no label overlaps the center trophy or important branch lines.
- Confirm outer ring spacing feels even with 32-team and partial knockout data.
- Confirm `/jatkokaavio` is unchanged for now.

## Notes

football-data.org does not expose exact bracket adjacency, so the tree remains structurally approximate. The design should look intentional even when exact match-to-match winner paths are inferred by kickoff order.
