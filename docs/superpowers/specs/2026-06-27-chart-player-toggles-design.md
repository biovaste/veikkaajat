# Chart Player Toggles + Brush Zoom — Design Spec

**Date:** 2026-06-27  
**File:** `components/PointsChart.tsx`

---

## Goal

Let users show/hide individual players on the leaderboard chart and zoom into a match range using a brush, so the chart stays readable as the tournament progresses and the field grows crowded.

---

## Scope

All changes are internal to `components/PointsChart.tsx`. No changes to `app/leaderboard/page.tsx` or any other file.

---

## State

Add one new piece of state to `PointsChart`:

```ts
const [hiddenPlayers, setHiddenPlayers] = useState<Set<string>>(new Set())
```

Default: empty set — all players visible.

---

## Pill Row

Rendered between the mode-tab header and the chart in both the inline card and the fullscreen overlay.

### Layout
- `flex flex-wrap gap-2` row
- One pill per player, in the same order as the `players` prop
- A **"Kaikki"** reset button at the end, only rendered when `hiddenPlayers.size > 0`

### Pill appearance

| State | Background | Border | Text color |
|-------|-----------|--------|------------|
| Visible | `playerColor` (full) | none | white |
| Hidden | white | `1px solid playerColor` | `playerColor` |

### Behaviour
- Click a visible pill → adds player to `hiddenPlayers`
- Click a hidden pill → removes player from `hiddenPlayers`
- Click "Kaikki" → resets `hiddenPlayers` to `new Set()`

---

## Chart Changes

### Remove `<Legend>`
The pills replace the legend entirely. Remove `<Legend ... />` from `ChartInner`.

### Filtered players
Before rendering `ChartInner`, derive:

```ts
const visiblePlayers = players.filter(p => !hiddenPlayers.has(p))
const visibleColors  = colors?.filter((_, i) => !hiddenPlayers.has(players[i]))
```

Pass `visiblePlayers` and `visibleColors` to `ChartInner` instead of the raw props.

### Sijainti mode domain
The `YAxis domain` for `sijainti` mode must use the **total** (unfiltered) player count so rankings remain comparable when some players are hidden:

```tsx
domain={mode === 'sijainti' ? [1, players.length] : undefined}
```

`players` here refers to the full prop, not `visiblePlayers`.

### Brush
Add Recharts `<Brush>` inside `<LineChart>`:

```tsx
<Brush dataKey="match" height={20} travellerWidth={8} stroke="#d1d5db" />
```

- Appears at the bottom of the chart, spanning the full width
- Default range = all matches (Recharts default)
- Works across all 4 modes (pisteet / sijainti / ero / ka-ero) without extra logic
- Chart height increased by 30px in both inline (+30 → 510px) and fullscreen (+30 → 630px) to accommodate the brush strip

---

## Fullscreen Overlay

The fullscreen overlay is rendered inside the same `PointsChart` component, so it reads the same `hiddenPlayers` state and the same `visiblePlayers` / `visibleColors` derived values. No additional state sync is needed. The pill row is duplicated in the overlay markup (same render logic).

---

## Out of Scope

- Persisting toggle state to localStorage
- A "deselect all" shortcut
- Changing the leaderboard page or any other component
