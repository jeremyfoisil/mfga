# Match Detail Modal Tabs + Statistics Tab — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `Compositions` / `Statistiques` tabs to the per-match modal, where the new Statistiques tab shows this match's team statistics (home vs away) fed by a server-side proxy.

**Architecture:** `LineupModal.vue` becomes a two-tab shell. The existing custom pitch stays under the default `Compositions` tab. A new `MatchStats.vue` renders comparison bars under `Statistiques`, lazily fetching from a new `match-stats-proxy` Supabase edge function that calls `fixtures/statistics?fixture=<matchId>` (matches.id IS the API-Football fixture id). The API key stays server-side — no widget.

**Tech Stack:** Vue 3 (`<script setup>` + inline styles), Pinia, Supabase Edge Functions (Deno), API-Football v3.

**Testing reality:** This repo has no unit-test runner. Verification = `npx vue-tsc --noEmit` (types + templates), edge function deploy + a curl smoke test, and manual browser checks. Do NOT add a test framework — out of scope.

---

## File Structure

- **Create** `supabase/functions/match-stats-proxy/index.ts` — edge function: fetch + orient + normalize match statistics.
- **Create** `src/components/modals/MatchStats.vue` — Statistiques tab body: fetch, states, comparison bars.
- **Modify** `src/components/modals/LineupModal.vue` — add tab bar + a `matchId` prop; gate the existing body to the `Compositions` tab; mount `MatchStats` lazily under `Statistiques`.
- **Modify** `src/components/tabs/TabMatchs.vue:745-757` — pass `:match-id="lineup.matchId"` to `LineupModal`.

---

## Task 1: Edge function `match-stats-proxy`

**Files:**
- Create: `supabase/functions/match-stats-proxy/index.ts`

- [ ] **Step 1: Create the edge function**

Create `supabase/functions/match-stats-proxy/index.ts` with the full content below. It mirrors `stats-proxy`/`squad-proxy` (same CORS, same key env, same `TEAM_ALIAS`/`norm`, same home/away flip-by-name as `squad-proxy`).

```typescript
import "jsr:@supabase/functions-js/edge-runtime.d.ts"

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const APISPORTS_KEY = Deno.env.get('APISPORTS_KEY') ?? '<APISPORTS_KEY>'
const API_HOST = 'v3.football.api-sports.io'

// API-Football names that differ from our DB names (kept in sync with squad-proxy)
const TEAM_ALIAS: Record<string, string> = {
  'Türkiye': 'Turkey', 'Cape Verde Islands': 'Cape Verde', 'Congo DR': 'DR Congo',
}
const norm = (n: string) => TEAM_ALIAS[n] ?? n

const apiFetch = (path: string) =>
  fetch(`https://${API_HOST}/${path}`, { headers: { 'x-apisports-key': APISPORTS_KEY } })

type ApiVal = number | string | null
interface ApiTeamStats {
  team: { id: number; name: string }
  statistics: { type: string; value: ApiVal }[]
}

type Kind = 'percent' | 'number'
interface StatLine { key: string; label: string; home: number; away: number; kind: Kind }

// Curated set + display order. `type` is the API-Football statistic label.
const SPEC: { key: string; label: string; type: string; kind: Kind }[] = [
  { key: 'possession',  label: 'Possession',     type: 'Ball Possession', kind: 'percent' },
  { key: 'shots_total', label: 'Tirs',           type: 'Total Shots',     kind: 'number'  },
  { key: 'shots_on',    label: 'Tirs cadrés',    type: 'Shots on Goal',   kind: 'number'  },
  { key: 'corners',     label: 'Corners',        type: 'Corner Kicks',    kind: 'number'  },
  { key: 'fouls',       label: 'Fautes',         type: 'Fouls',           kind: 'number'  },
  { key: 'offsides',    label: 'Hors-jeu',       type: 'Offsides',        kind: 'number'  },
  { key: 'yellow',      label: 'Cartons jaunes', type: 'Yellow Cards',    kind: 'number'  },
  { key: 'red',         label: 'Cartons rouges', type: 'Red Cards',       kind: 'number'  },
  { key: 'xg',          label: 'xG',             type: 'expected_goals',  kind: 'number'  },
]

// "55%" -> 55, "1.8" -> 1.8, null -> 0
function numVal(v: ApiVal): number {
  if (v == null) return 0
  if (typeof v === 'number') return v
  const n = parseFloat(String(v).replace('%', '').trim())
  return isNaN(n) ? 0 : n
}

function typeMap(entry: ApiTeamStats): Map<string, ApiVal> {
  const m = new Map<string, ApiVal>()
  for (const s of entry.statistics ?? []) m.set(s.type, s.value)
  return m
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

  const { matchId, home } = await req.json() as { matchId?: number; home?: string; away?: string }
  if (!matchId) return json({ error: 'matchId required' }, 400)

  const res = await apiFetch(`fixtures/statistics?fixture=${matchId}`)
  if (!res.ok) return json({ data: [] })
  const { response } = await res.json() as { response: ApiTeamStats[] }
  if (!Array.isArray(response) || response.length < 2) return json({ data: [] })

  // API returns [home, away] in fixture order; flip if it disagrees with our home.
  let [homeEntry, awayEntry] = response
  if (home && norm(homeEntry.team.name) !== home && norm(awayEntry.team.name) === home) {
    [homeEntry, awayEntry] = [awayEntry, homeEntry]
  }
  const homeMap = typeMap(homeEntry)
  const awayMap = typeMap(awayEntry)

  const data: StatLine[] = []
  for (const s of SPEC) {
    const hRaw = homeMap.get(s.type)
    const aRaw = awayMap.get(s.type)
    if (hRaw === undefined && aRaw === undefined) continue // absent both sides
    const homeN = numVal(hRaw ?? null)
    const awayN = numVal(aRaw ?? null)
    if (s.key === 'xg' && homeN === 0 && awayN === 0) continue // xG absent/zero both sides
    data.push({ key: s.key, label: s.label, home: homeN, away: awayN, kind: s.kind })
  }

  return json({ data })
})
```

- [ ] **Step 2: Deploy the function**

Run: `npx supabase functions deploy match-stats-proxy --project-ref sazupuqxwrnvgzsdxkjg`
Expected: deploy succeeds (`Deployed Functions on project sazupuqxwrnvgzsdxkjg: match-stats-proxy`).

(Alternatively deploy via the Supabase MCP `deploy_edge_function`.)

- [ ] **Step 3: Smoke-test the deployed function**

Get the project anon key (Supabase dashboard → Settings → API, or `npx supabase status`) and set it:

```bash
export ANON_KEY="<project anon key>"
curl -s -X POST \
  "https://sazupuqxwrnvgzsdxkjg.supabase.co/functions/v1/match-stats-proxy" \
  -H "Authorization: Bearer $ANON_KEY" \
  -H "apikey: $ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"matchId":215662,"home":"France","away":"England"}'
```

Expected: HTTP 200 with `{"data":[ ... ]}`. For a played fixture the array has entries like
`{"key":"possession","label":"Possession","home":55,"away":45,"kind":"percent"}`. For a
not-yet-played fixture, expect `{"data":[]}`. (The `home` value here is only used for
orientation; any real team name for that fixture works for the smoke test.)

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/match-stats-proxy/index.ts
git commit -m "feat(stats): add match-stats-proxy edge function for per-fixture team stats"
```

---

## Task 2: `MatchStats.vue` component

**Files:**
- Create: `src/components/modals/MatchStats.vue`

- [ ] **Step 1: Create the component**

Create `src/components/modals/MatchStats.vue` with the full content below. It fetches once in
`onMounted` (the parent only mounts it on first visit to the tab, satisfying lazy + cache), and
renders loading / error / empty / bars states in the modal's style.

```vue
<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { sb } from '../../supabase'
import { getFlagBg } from '../../utils/ui'

interface StatLine { key: string; label: string; home: number; away: number; kind: 'percent' | 'number' }

const props = defineProps<{ matchId: number; homeName: string; awayName: string }>()

const loading = ref(true)
const error = ref<string | null>(null)
const lines = ref<StatLine[]>([])

onMounted(async () => {
  try {
    const { data, error: err } = await sb.functions.invoke('match-stats-proxy', {
      body: { matchId: props.matchId, home: props.homeName, away: props.awayName },
    })
    if (err) throw err
    lines.value = (data as { data: StatLine[] }).data ?? []
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    loading.value = false
  }
})

function fmt(v: number, kind: 'percent' | 'number'): string {
  if (kind === 'percent') return v + '%'
  return Number.isInteger(v) ? String(v) : v.toFixed(1)
}
// Width % of the home segment; neutral 50 when there's no data on either side.
function homePct(l: StatLine): number {
  const t = l.home + l.away
  return t === 0 ? 50 : Math.round((l.home / t) * 100)
}
</script>

<template>
  <!-- Loading -->
  <div v-if="loading" style="display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 60px 0; gap: 14px">
    <div class="stats-spinner"></div>
    <div style="font-size: 12px; color: #64748b; letter-spacing: 1px; font-family: Anton, sans-serif">CHARGEMENT…</div>
  </div>

  <!-- Error -->
  <div v-else-if="error" style="text-align: center; padding: 40px; color: #ef4444; font-size: 13px">{{ error }}</div>

  <!-- Empty -->
  <div v-else-if="lines.length === 0" style="text-align: center; padding: 40px 20px; color: #64748b">
    <div style="font-size: 13px; font-family: Anton, sans-serif; letter-spacing: 1px">Statistiques pas encore disponibles</div>
    <div style="font-size: 11px; color: #334155; margin-top: 6px">Elles apparaîtront une fois le match commencé.</div>
  </div>

  <!-- Bars -->
  <div v-else style="padding: 14px 16px 18px">
    <div v-for="l in lines" :key="l.key" style="margin-bottom: 12px">
      <!-- values + label -->
      <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px">
        <span style="font-family: Anton, sans-serif; font-size: 14px; color: #f8fafc; min-width: 40px; text-align: left">{{ fmt(l.home, l.kind) }}</span>
        <span style="font-size: 10px; color: #94a3b8; letter-spacing: 1px; text-transform: uppercase">{{ l.label }}</span>
        <span style="font-family: Anton, sans-serif; font-size: 14px; color: #f8fafc; min-width: 40px; text-align: right">{{ fmt(l.away, l.kind) }}</span>
      </div>
      <!-- comparison bar -->
      <div style="display: flex; height: 6px; border-radius: 3px; overflow: hidden; background: #1e293b">
        <div :style="{ width: homePct(l) + '%', background: l.home + l.away === 0 ? '#334155' : getFlagBg(homeName) }"></div>
        <div :style="{ width: (100 - homePct(l)) + '%', background: l.home + l.away === 0 ? '#1e293b' : getFlagBg(awayName) }"></div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.stats-spinner {
  width: 32px; height: 32px;
  border: 3px solid #1e293b;
  border-top-color: #22c55e;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg) } }
</style>
```

- [ ] **Step 2: Type-check**

Run: `npx vue-tsc --noEmit`
Expected: exit 0, no errors. (The component is not yet imported anywhere — this only confirms it compiles in isolation.)

- [ ] **Step 3: Commit**

```bash
git add src/components/modals/MatchStats.vue
git commit -m "feat(stats): add MatchStats comparison-bars component"
```

---

## Task 3: Wire tabs into `LineupModal.vue` + pass matchId

**Files:**
- Modify: `src/components/modals/LineupModal.vue`
- Modify: `src/components/tabs/TabMatchs.vue:745-757`

- [ ] **Step 1: Import MatchStats, add tab state and a matchId prop**

In `src/components/modals/LineupModal.vue`, add the import at the top of `<script setup>`
(after the existing `import { C } from '../../constants/ui'` line):

```typescript
import MatchStats from './MatchStats.vue'
```

Add `matchId` to the props interface. The current `defineProps` call is:

```typescript
const props = withDefaults(defineProps<{
  loading: boolean
  data: LineupData | null
  homeName: string
  awayName: string
  error: string | null
  homeGoals?: Goal[]
  awayGoals?: Goal[]
  homeCards?: Card[]
  awayCards?: Card[]
}>(), {
  homeGoals: () => [], awayGoals: () => [],
  homeCards: () => [], awayCards: () => [],
})
```

Change the first line to add `matchId: number`:

```typescript
const props = withDefaults(defineProps<{
  matchId: number
  loading: boolean
  data: LineupData | null
  homeName: string
  awayName: string
  error: string | null
  homeGoals?: Goal[]
  awayGoals?: Goal[]
  homeCards?: Card[]
  awayCards?: Card[]
}>(), {
  homeGoals: () => [], awayGoals: () => [],
  homeCards: () => [], awayCards: () => [],
})
```

Add tab state immediately after the `defineEmits` line (`const emit = defineEmits<{ (e: 'close'): void }>()`):

```typescript
const activeTab = ref<'lineup' | 'stats'>('lineup')
const statsVisited = ref(false)
function showStats() { activeTab.value = 'stats'; statsVisited.value = true }
```

`ref` is already imported on line 2 (`import { computed, ref } from 'vue'`) — no import change needed.

- [ ] **Step 2: Add the tab bar after the header**

In the template, the header block ends at the `</div>` on line 207 (the one closing the
`display: flex; ... padding: 14px 14px 10px` header row, right after the close button). Insert
the tab bar immediately after that closing `</div>` and before the `<!-- Loading -->` comment:

```html
      <!-- Tab bar -->
      <div style="display: flex; border-bottom: 1px solid #1e293b">
        <button
          @click="activeTab = 'lineup'"
          :style="{ flex: 1, padding: '10px 0', background: 'transparent', border: 'none', borderBottom: activeTab === 'lineup' ? '2px solid #22c55e' : '2px solid transparent', color: activeTab === 'lineup' ? '#f8fafc' : '#64748b', fontFamily: 'Anton, sans-serif', fontSize: '12px', letterSpacing: '1.5px', textTransform: 'uppercase', cursor: 'pointer' }">
          Compositions
        </button>
        <button
          @click="showStats"
          :style="{ flex: 1, padding: '10px 0', background: 'transparent', border: 'none', borderBottom: activeTab === 'stats' ? '2px solid #22c55e' : '2px solid transparent', color: activeTab === 'stats' ? '#f8fafc' : '#64748b', fontFamily: 'Anton, sans-serif', fontSize: '12px', letterSpacing: '1.5px', textTransform: 'uppercase', cursor: 'pointer' }">
          Statistiques
        </button>
      </div>
```

- [ ] **Step 3: Gate the lineup body to the Compositions tab**

The lineup body is the sequence of sibling blocks: `<!-- Loading -->` (line ~210), `<!-- Error -->`,
`<!-- Pitch -->`, `<!-- Substitutes -->`, and `<!-- Squad lists -->` (ends at the `</div>` on
line ~384). Wrap all of them in a single `v-show` container so they show only under the
`Compositions` tab.

Immediately BEFORE the `<!-- Loading -->` comment, insert the opening tag:

```html
      <!-- Compositions tab body -->
      <div v-show="activeTab === 'lineup'">
```

Immediately AFTER the closing `</div>` of the Squad lists block (line ~384, the last block
before the `</div>` that closes the modal card), insert the closing tag:

```html
      </div>
      <!-- /Compositions tab body -->
```

- [ ] **Step 4: Add the Statistiques tab body**

Right after the `<!-- /Compositions tab body -->` line from Step 3, add the stats body. It mounts
`MatchStats` only once (`v-if="statsVisited"`) and toggles visibility with `v-show`, so switching
back to Statistiques never re-fetches:

```html
      <!-- Statistiques tab body -->
      <div v-show="activeTab === 'stats'">
        <MatchStats v-if="statsVisited" :match-id="matchId" :home-name="homeName" :away-name="awayName" />
      </div>
```

- [ ] **Step 5: Pass matchId from TabMatchs**

In `src/components/tabs/TabMatchs.vue`, the `<LineupModal>` usage starts at line 745. Add the
`match-id` binding. Change:

```html
  <LineupModal
    v-if="lineup.open"
    :loading="lineup.loading"
```

to:

```html
  <LineupModal
    v-if="lineup.open"
    :match-id="lineup.matchId"
    :loading="lineup.loading"
```

- [ ] **Step 6: Type-check**

Run: `npx vue-tsc --noEmit`
Expected: exit 0, no errors.

- [ ] **Step 7: Manual browser verification**

With the dev server running (`npm run dev`), in the app:
1. Open a **finished** match's modal → defaults to `Compositions` (pitch shown).
2. Click `Statistiques` → spinner, then comparison bars (possession as `%`, others numeric, xG if present). Bar segment colors match the two teams' flag colors.
3. Click back to `Compositions` then `Statistiques` again → bars appear instantly with **no** new network request (check the Network panel — only one `match-stats-proxy` call total).
4. Open a **future** match's modal → `Statistiques` shows "Statistiques pas encore disponibles".

- [ ] **Step 8: Commit**

```bash
git add src/components/modals/LineupModal.vue src/components/tabs/TabMatchs.vue
git commit -m "feat(stats): add Compositions/Statistiques tabs to the match modal"
```

---

## Self-Review

**Spec coverage:**
- Tab shell, default Compositions, pitch unchanged → Task 3 (Steps 2-4).
- `MatchStats.vue` separate component → Task 2.
- `match-stats-proxy` (fixtures/statistics, server key, orient by name) → Task 1.
- Curated set + xG (omit when absent/zero both sides) → Task 1 `SPEC` + xG guard.
- Lazy load + in-modal cache → Task 3 `statsVisited` + `v-show` (mount once).
- Comparison bars, flag colors, percent/number formatting → Task 2.
- Loading / empty / error states → Task 2 template.
- matches.id == fixture id → Task 1 uses `matchId` directly as fixture.

**Placeholder scan:** All code blocks are complete; the only external value is the project anon key in the Task 1 smoke test, obtained from the dashboard / `supabase status` (a real input, not a placeholder).

**Type consistency:** `StatLine { key, label, home, away, kind }` identical in the edge function (Task 1) and the component (Task 2). Proxy body `{ matchId, home, away }` matches the component's invoke call and the function's destructure. `matchId` prop added in both LineupModal props (Task 3 Step 1) and the TabMatchs binding (Task 3 Step 5).
