# Bracket visual — status

Both the web `/leaderboard` bracket (`components/PlayoffBracket.tsx`) and the Telegram
`/jatkokaavio` bracket (`lib/telegram/bracket-image.tsx`) are done and share the same
`lib/bracket-geometry.ts` layout (`paths` + `dots`, real FIFA bracket adjacency instead of a
kickoff-order guess). See `docs/FEATURES.md` → "Playoff Bracket" for the current design and
implementation details.
