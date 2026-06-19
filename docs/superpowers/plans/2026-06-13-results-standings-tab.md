# Résultats Tab (Group Standings) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the static knockout-bracket "Tableau" tab with a "Résultats" tab showing World Cup group standings (rank, played, W/D/L, goal difference, points) fed by a server-side proxy.

**Architecture:** A new `standings-proxy` Supabase edge function calls API-Football `standings?league=1&season=2026` and returns normalized `{ data: GroupStanding[] }`. A new `TabResultats.vue` fetches it on mount and renders one table per group (top 2 highlighted). The old `TabTableau.vue` is removed and the tab is rewired in `App.vue` + `TABS`.

**Tech Stack:** Vue 3 (`<script setup>` + inline styles), Pinia, Supabase Edge Functions (Deno), API-Football v3.

**Testing reality:** No unit-test runner in this repo. Verification = `npx vue-tsc --noEmit`, edge function deploy + curl smoke test, manual browser checks. Do NOT add a test framework.

---

## File Structure

- **Create** `supabase/functions/standings-proxy/index.ts` — edge function: fetch + normalize group standings.
- **Create** `src/components/tabs/TabResultats.vue` — the Résultats tab: fetch, states, one standings table per group.
- **Delete** `src/components/tabs/TabTableau.vue` — replaced.
- **Modify** `src/constants/ui.ts:10` — `TABS` label `"Tableau"` → `"Résultats"`.
- **Modify** `src/App.vue:16,72` — swap `TabTableau` import + usage for `TabResultats`.

---

## Task 1: Edge function `standings-proxy`

**Files:**
- Create: `supabase/functions/standings-proxy/index.ts`

- [ ] **Step 1: Create the edge function**

Create `supabase/functions/standings-proxy/index.ts` with the full content below (mirrors `match-stats-proxy`/`stats-proxy`: same CORS, key env, `TEAM_ALIAS`/`norm`, `apiFetch`, `json` helper, OPTIONS).

```typescript
import "jsr:@supabase/functions-js/edge-runtime.d.ts"

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const APISPORTS_KEY = Deno.env.get('APISPORTS_KEY') ?? '<APISPORTS_KEY>'
const API_HOST = 'v3.football.api-sports.io'
const LEAGUE = 1
const SEASON = 2026

// API-Football names that differ from our DB names (kept in sync with the other proxies)
const TEAM_ALIAS: Record<string, string> = {
  'Türkiye': 'Turkey', 'Cape Verde Islands': 'Cape Verde', 'Congo DR': 'DR Congo',
}
const norm = (n: string) => TEAM_ALIAS[n] ?? n

const apiFetch = (path: string) =>
  fetch(`https://${API_HOST}/${path}`, { headers: { 'x-apisports-key': APISPORTS_KEY } })

interface ApiStandingRow {
  rank: number
  team: { id: number; name: string }
  points: number
  goalsDiff: number
  group: string
  all: { played: number; win: number; draw: number; lose: number }
}

interface StandingRow {
  rank: number; team: string; played: number; win: number; draw: number; lose: number; diff: number; points: number
}
interface GroupStanding { group: string; rows: StandingRow[] }

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

  const res = await apiFetch(`standings?league=${LEAGUE}&season=${SEASON}`)
  if (!res.ok) return json({ data: [] })
  const { response } = await res.json() as { response: { league?: { standings?: ApiStandingRow[][] } }[] }
  const groups = response?.[0]?.league?.standings
  if (!Array.isArray(groups) || groups.length === 0) return json({ data: [] })

  const data: GroupStanding[] = groups.map(rows => ({
    group: (rows[0]?.group ?? '').replace(/^Group\s+/, ''),
    rows: rows.map(r => ({
      rank: r.rank,
      team: norm(r.team.name),
      played: r.all.played,
      win: r.all.win,
      draw: r.all.draw,
      lose: r.all.lose,
      diff: r.goalsDiff,
      points: r.points,
    })),
  }))

  return json({ data })
})
```

- [ ] **Step 2: Deploy the function**

Run: `npx supabase functions deploy standings-proxy --project-ref sazupuqxwrnvgzsdxkjg`
Expected: deploy succeeds. (Alternatively use the Supabase MCP `deploy_edge_function`.)

- [ ] **Step 3: Smoke-test the deployed function**

Get the project anon key (Supabase dashboard → Settings → API, `npx supabase status`, or the Supabase MCP `get_publishable_keys` for project `sazupuqxwrnvgzsdxkjg`) and:

```bash
export ANON_KEY="<project anon key>"
curl -s -X POST \
  "https://sazupuqxwrnvgzsdxkjg.supabase.co/functions/v1/standings-proxy" \
  -H "Authorization: Bearer $ANON_KEY" -H "apikey: $ANON_KEY" \
  -H "Content-Type: application/json" -d '{}'
```

Expected: HTTP 200 with `{"data":[...]}`. If group standings exist, each element looks like
`{"group":"A","rows":[{"rank":1,"team":"...","played":3,"win":2,"draw":1,"lose":0,"diff":4,"points":7}, ...]}`.
If the WC standings aren't published/seeded yet, expect `{"data":[]}` — also an acceptable passing result. Report which you got (paste the JSON).

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/standings-proxy/index.ts
git commit -m "feat(standings): add standings-proxy edge function for WC group tables"
```

---

## Task 2: `TabResultats.vue` component

**Files:**
- Create: `src/components/tabs/TabResultats.vue`

- [ ] **Step 1: Create the component**

Create `src/components/tabs/TabResultats.vue` with the full content below. It fetches `standings-proxy` on mount and renders loading / error / empty / per-group tables, with the top 2 of each group highlighted (green tint + left accent bar). `getFlag(team)` and `C` already exist and are used by other tabs.

```vue
<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { sb } from '../../supabase'
import { C } from '../../constants/ui'
import { getFlag } from '../../utils/ui'

interface StandingRow { rank: number; team: string; played: number; win: number; draw: number; lose: number; diff: number; points: number }
interface GroupStanding { group: string; rows: StandingRow[] }

const loading = ref(true)
const error = ref<string | null>(null)
const groups = ref<GroupStanding[]>([])

onMounted(async () => {
  try {
    const { data, error: err } = await sb.functions.invoke('standings-proxy')
    if (err) throw err
    groups.value = (data as { data: GroupStanding[] }).data ?? []
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    loading.value = false
  }
})

function fmtDiff(d: number): string { return d > 0 ? '+' + d : String(d) }
</script>

<template>
  <!-- Loading -->
  <div v-if="loading" style="display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 60px 0; gap: 14px">
    <div class="res-spinner"></div>
    <div style="font-size: 12px; color: #64748b; letter-spacing: 1px; font-family: Anton, sans-serif">CHARGEMENT…</div>
  </div>

  <!-- Error -->
  <div v-else-if="error" style="text-align: center; padding: 40px; color: #ef4444; font-size: 13px">{{ error }}</div>

  <!-- Empty -->
  <div v-else-if="groups.length === 0" :style="{ background: C.card, border: '1px solid ' + C.border, borderRadius: '12px', padding: '40px 20px', textAlign: 'center', marginTop: '10px' }">
    <div style="font-size: 13px; font-family: Anton, sans-serif; letter-spacing: 1px; color: #fbbf24">CLASSEMENTS PAS ENCORE DISPONIBLES</div>
    <div style="font-size: 11px; color: #475569; margin-top: 6px">Ils apparaîtront une fois les matchs de poule joués.</div>
  </div>

  <!-- Groups -->
  <template v-else>
    <div v-for="g in groups" :key="g.group" :style="{ background: C.card, border: '1px solid ' + C.border, borderRadius: '12px', padding: '0', marginTop: '12px', overflow: 'hidden' }">
      <div style="padding: 10px 14px; border-bottom: 1px solid #1e293b; font-family: Anton, sans-serif; font-size: 13px; letter-spacing: 1.5px; color: #fbbf24">GROUPE {{ g.group }}</div>
      <table style="width: 100%; border-collapse: collapse">
        <thead>
          <tr style="font-size: 9px; color: #475569; text-transform: uppercase; letter-spacing: 0.5px">
            <th style="padding: 6px 4px 6px 10px; text-align: center; width: 22px">#</th>
            <th style="padding: 6px 4px; text-align: left">Équipe</th>
            <th style="padding: 6px 4px; text-align: center; width: 24px">J</th>
            <th style="padding: 6px 4px; text-align: center; width: 24px">G</th>
            <th style="padding: 6px 4px; text-align: center; width: 24px">N</th>
            <th style="padding: 6px 4px; text-align: center; width: 24px">P</th>
            <th style="padding: 6px 4px; text-align: center; width: 34px">Diff</th>
            <th style="padding: 6px 10px 6px 4px; text-align: center; width: 30px">Pts</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in g.rows" :key="r.team"
            :style="{ borderTop: '1px solid #0f172a', background: r.rank <= 2 ? 'rgba(34,197,94,0.08)' : 'transparent' }">
            <td style="padding: 8px 4px 8px 10px; text-align: center; position: relative">
              <span v-if="r.rank <= 2" style="position: absolute; left: 0; top: 0; bottom: 0; width: 3px; background: #22c55e"></span>
              <span style="font-family: Anton, sans-serif; font-size: 12px; color: #94a3b8">{{ r.rank }}</span>
            </td>
            <td style="padding: 8px 4px">
              <span style="display: inline-flex; align-items: center; gap: 6px">
                <span class="flag" style="font-size: 15px">{{ getFlag(r.team) }}</span>
                <span style="font-size: 12px; font-weight: 700; color: #f8fafc">{{ r.team }}</span>
              </span>
            </td>
            <td style="padding: 8px 4px; text-align: center; font-size: 12px; color: #94a3b8">{{ r.played }}</td>
            <td style="padding: 8px 4px; text-align: center; font-size: 12px; color: #94a3b8">{{ r.win }}</td>
            <td style="padding: 8px 4px; text-align: center; font-size: 12px; color: #94a3b8">{{ r.draw }}</td>
            <td style="padding: 8px 4px; text-align: center; font-size: 12px; color: #94a3b8">{{ r.lose }}</td>
            <td style="padding: 8px 4px; text-align: center; font-size: 12px; color: #cbd5e1">{{ fmtDiff(r.diff) }}</td>
            <td style="padding: 8px 10px 8px 4px; text-align: center; font-family: Anton, sans-serif; font-size: 14px; color: #f8fafc">{{ r.points }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </template>
</template>

<style scoped>
.res-spinner {
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
Expected: exit 0. (Not yet imported anywhere — confirms it compiles in isolation. Note: `App.vue` still imports `TabTableau` at this point, which still exists, so the project compiles.)

- [ ] **Step 3: Commit**

```bash
git add src/components/tabs/TabResultats.vue
git commit -m "feat(standings): add TabResultats group-standings tab component"
```

---

## Task 3: Rewire the tab (TABS label, App.vue, remove TabTableau)

**Files:**
- Modify: `src/constants/ui.ts:10`
- Modify: `src/App.vue` (line 16 import, line 72 usage)
- Delete: `src/components/tabs/TabTableau.vue`

- [ ] **Step 1: Rename the tab label in TABS**

In `src/constants/ui.ts`, line 10 is:
```typescript
export const TABS = ["Participants", "Matchs", "Bonus", "Statistiques", "Tableau", "Classement"] as const
```
Change `"Tableau"` to `"Résultats"` (same position):
```typescript
export const TABS = ["Participants", "Matchs", "Bonus", "Statistiques", "Résultats", "Classement"] as const
```

- [ ] **Step 2: Swap the import in App.vue**

In `src/App.vue`, change line 16:
```typescript
import TabTableau from './components/tabs/TabTableau.vue'
```
to:
```typescript
import TabResultats from './components/tabs/TabResultats.vue'
```

- [ ] **Step 3: Swap the usage in App.vue**

In `src/App.vue`, change the tab-4 line (line 72):
```html
        <TabTableau      v-else-if="app.tab === 4" />
```
to:
```html
        <TabResultats    v-else-if="app.tab === 4" />
```

- [ ] **Step 4: Delete the old component**

Run: `git rm src/components/tabs/TabTableau.vue`
Expected: file staged for deletion. (It is no longer imported after Steps 2-3.)

- [ ] **Step 5: Type-check**

Run: `npx vue-tsc --noEmit`
Expected: exit 0, no errors. (If it complains about a missing `TabTableau` import, Step 2/3 weren't applied correctly.)

- [ ] **Step 6: Manual browser verification**

With the dev server running (`npm run dev`):
1. The 5th tab label now reads **Résultats** (was Tableau).
2. Open it → spinner, then one card per group ("GROUPE A", …) with columns # · Équipe · J · G · N · P · Diff · Pts.
3. The top 2 rows of each group have a green tint + a green left accent bar.
4. Diff shows a sign (`+3`, `-1`, `0`).
5. If standings aren't published yet, the tab shows "CLASSEMENTS PAS ENCORE DISPONIBLES".

- [ ] **Step 7: Commit**

```bash
git add src/constants/ui.ts src/App.vue
git commit -m "feat(standings): replace Tableau tab with Résultats (group standings)"
```

---

## Self-Review

**Spec coverage:**
- `standings-proxy` (standings endpoint, server key, normalize groups, norm team names) → Task 1.
- Output shape `{ data: GroupStanding[] }`, group letter from `"Group X"` → Task 1.
- `TabResultats.vue` fetch-on-mount + states + per-group tables → Task 2.
- Columns Rang · Équipe · J · G · N · P · Diff · Pts; signed diff; Anton Pts → Task 2.
- Top-2 highlight → Task 2 (green tint + accent bar on `rank <= 2`).
- Tab label "Tableau" → "Résultats" → Task 3 Step 1.
- App.vue rewire + delete TabTableau → Task 3 Steps 2-4.
- Bracket removed (TabTableau deleted; `tableau.png` left in place, no longer referenced) → Task 3.

**Placeholder scan:** All code blocks complete. The only external value is the project anon key in the Task 1 smoke test (obtained from dashboard/CLI/MCP — a real input).

**Type consistency:** `StandingRow`/`GroupStanding` field names (`rank, team, played, win, draw, lose, diff, points` / `group, rows`) are identical in the edge function (Task 1) and the component (Task 2). The invoke call `sb.functions.invoke('standings-proxy')` with no body matches the function (which ignores the body). Tab index 4 is preserved across `TABS`, `App.vue` usage, and `app.tab === 4`.
