# Chart Player Toggles + Brush Zoom Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add per-player toggle pills and a Recharts Brush zoom strip to the leaderboard points chart.

**Architecture:** All changes are internal to `components/PointsChart.tsx`. Task 1 updates the `ChartInner` sub-component (remove Legend, add Brush, add `totalPlayers` prop). Task 2 adds `hiddenPlayers` state, derives visible player arrays, and renders the pill row in both the inline card and fullscreen overlay.

**Tech Stack:** React (useState, useMemo, useCallback), Recharts (`Brush`), Tailwind CSS inline styles for dynamic player colors.

## Global Constraints

- UI copy is Finnish — any new labels must be Finnish (e.g. "Kaikki" for reset)
- Tailwind CSS for layout/spacing; inline `style` props for dynamic player colors (no arbitrary Tailwind values)
- No changes outside `components/PointsChart.tsx`
- No new npm packages — `Brush` is already part of the installed `recharts` package

---

### Task 1: Update `ChartInner` — add Brush, remove Legend, add `totalPlayers` prop

**Files:**
- Modify: `components/PointsChart.tsx` (ChartInner function and its call sites)

**Interfaces:**
- Produces: `ChartInner` accepts new prop `totalPlayers: number`; `Legend` removed; `Brush` added
- Consumed by Task 2: call sites pass `totalPlayers={players.length}` (total unfiltered count)

- [ ] **Step 1: Update the recharts import line**

Replace:
```tsx
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts'
```
With:
```tsx
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Brush,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts'
```

- [ ] **Step 2: Add `totalPlayers` to ChartInner's props interface**

Replace the `ChartInner` function signature:
```tsx
function ChartInner({
  activeData,
  players,
  colors,
  mode,
  height,
}: {
  activeData: Record<string, number>[]
  players: string[]
  colors?: string[]
  mode: Mode
  height: number
}) {
```
With:
```tsx
function ChartInner({
  activeData,
  players,
  colors,
  mode,
  height,
  totalPlayers,
}: {
  activeData: Record<string, number>[]
  players: string[]
  colors?: string[]
  mode: Mode
  height: number
  totalPlayers: number
}) {
```

- [ ] **Step 3: Inside ChartInner, replace Legend with Brush and use totalPlayers for domain**

Replace the full `return` block of `ChartInner`:
```tsx
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={activeData} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
        <XAxis
          dataKey="match"
          label={{ value: 'Ottelu', position: 'insideBottomRight', offset: -8, fontSize: 11 }}
          tick={{ fontSize: 11 }}
        />
        <YAxis
          tick={{ fontSize: 11 }}
          width={36}
          reversed={mode === 'sijainti'}
          tickFormatter={mode === 'sijainti' ? (v: number) => `${v}.` : undefined}
          domain={mode === 'sijainti' ? [1, totalPlayers] : undefined}
          allowDecimals={false}
        />
        <Tooltip content={<SortedTooltip mode={mode} />} />
        <Brush dataKey="match" height={20} travellerWidth={8} stroke="#d1d5db" />
        {(mode === 'ero' || mode === 'ka-ero') && <ReferenceLine y={0} stroke="#d1d5db" strokeDasharray="4 4" />}
        {players.map((player, i) => (
          <Line
            key={player}
            type="linear"
            dataKey={player}
            stroke={colors?.[i] ?? '#888888'}
            strokeWidth={1.5}
            dot={false}
            activeDot={{ r: 3 }}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  )
```

- [ ] **Step 4: Update the two ChartInner call sites to pass totalPlayers**

In the inline card section, change:
```tsx
<ChartInner activeData={activeData} players={players} colors={colors} mode={mode} height={480} />
```
To:
```tsx
<ChartInner activeData={activeData} players={players} colors={colors} mode={mode} height={510} totalPlayers={players.length} />
```

In the fullscreen overlay section, change:
```tsx
<ChartInner activeData={activeData} players={players} colors={colors} mode={mode} height={600} />
```
To:
```tsx
<ChartInner activeData={activeData} players={players} colors={colors} mode={mode} height={630} totalPlayers={players.length} />
```

- [ ] **Step 5: Verify TypeScript compiles**

Run:
```bash
npm run build
```
Expected: build succeeds with no type errors. If `Legend` is flagged as unused, it was already removed from the import in Step 1 — nothing more to do.

- [ ] **Step 6: Commit**

```bash
git add components/PointsChart.tsx
git commit -m "feat(chart): add Brush zoom, remove Legend, add totalPlayers prop to ChartInner"
```

---

### Task 2: Add hiddenPlayers state and pill row UI

**Files:**
- Modify: `components/PointsChart.tsx` (PointsChart component body and both render sites)

**Interfaces:**
- Consumes from Task 1: `ChartInner` accepts `totalPlayers: number`
- Produces: `PointsChart` passes `visiblePlayers`/`visibleColors` to `ChartInner`; pill row renders in both inline card and fullscreen overlay

- [ ] **Step 1: Add hiddenPlayers state inside PointsChart**

Inside the `PointsChart` function body, after the existing `const [expanded, setExpanded] = useState(false)` line, add:
```tsx
const [hiddenPlayers, setHiddenPlayers] = useState<Set<string>>(new Set())

function togglePlayer(name: string) {
  setHiddenPlayers(prev => {
    const next = new Set(prev)
    if (next.has(name)) next.delete(name)
    else next.add(name)
    return next
  })
}
```

- [ ] **Step 2: Derive visiblePlayers and visibleColors**

After the `const activeData = ...` line, add:
```tsx
const visiblePlayers = players.filter(p => !hiddenPlayers.has(p))
const visibleColors = colors?.filter((_, i) => !hiddenPlayers.has(players[i]))
```

- [ ] **Step 3: Define the pillRow JSX element**

After the `visibleColors` line, add:
```tsx
const pillRow = (
  <div className="flex flex-wrap gap-2 mb-3">
    {players.map((player, i) => {
      const color = colors?.[i] ?? '#888888'
      const hidden = hiddenPlayers.has(player)
      return (
        <button
          key={player}
          onClick={() => togglePlayer(player)}
          className="px-2.5 py-1 rounded-full text-xs font-medium transition-colors"
          style={
            hidden
              ? { backgroundColor: 'white', color, border: `1.5px solid ${color}` }
              : { backgroundColor: color, color: 'white', border: `1.5px solid ${color}` }
          }
        >
          {player}
        </button>
      )
    })}
    {hiddenPlayers.size > 0 && (
      <button
        onClick={() => setHiddenPlayers(new Set())}
        className="px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-500 hover:bg-gray-200 transition-colors"
      >
        Kaikki
      </button>
    )}
  </div>
)
```

- [ ] **Step 4: Render pillRow and pass visiblePlayers/visibleColors in the inline card**

Replace:
```tsx
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        {header(() => setExpanded(true))}
        <ChartInner activeData={activeData} players={players} colors={colors} mode={mode} height={510} totalPlayers={players.length} />
      </div>
```
With:
```tsx
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        {header(() => setExpanded(true))}
        {pillRow}
        <ChartInner activeData={activeData} players={visiblePlayers} colors={visibleColors} mode={mode} height={510} totalPlayers={players.length} />
      </div>
```

- [ ] **Step 5: Render pillRow and pass visiblePlayers/visibleColors in the fullscreen overlay**

Replace:
```tsx
            <div className="flex-1 min-h-0">
              <ChartInner activeData={activeData} players={players} colors={colors} mode={mode} height={630} totalPlayers={players.length} />
            </div>
```
With:
```tsx
            <div className="flex-1 min-h-0 flex flex-col">
              {pillRow}
              <ChartInner activeData={activeData} players={visiblePlayers} colors={visibleColors} mode={mode} height={630} totalPlayers={players.length} />
            </div>
```

- [ ] **Step 6: Verify TypeScript compiles**

Run:
```bash
npm run build
```
Expected: build succeeds with no type errors.

- [ ] **Step 7: Manual verification**

Run:
```bash
npm run dev
```
Open http://localhost:3000/leaderboard and verify:
1. Colored pills appear above the chart, one per player, all fully colored
2. Clicking a pill turns it white with a colored outline; that player's line disappears from the chart
3. Clicking the hidden pill again restores the line
4. "Kaikki" button appears when any player is hidden; clicking it restores all players
5. The Brush strip appears at the bottom of the chart; dragging the handles zooms the x-axis
6. All 4 mode tabs (Pisteet / Sijainti / Ero / KA-ero) work with the toggle and brush
7. In Sijainti mode, rankings are based on all players even when some are hidden
8. Expanding to fullscreen shows the pill row and brush in the overlay too
9. Toggle state is preserved when switching between chart modes

- [ ] **Step 8: Commit**

```bash
git add components/PointsChart.tsx
git commit -m "feat(chart): add player toggle pills and brush zoom"
```
