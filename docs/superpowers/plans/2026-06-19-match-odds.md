# Cotes des matchs (Unibet) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Afficher sur chaque carte de match les cotes Unibet « vainqueur du match » (1/N/2), alimentées par une edge function `sync-odds` (bouton admin + cron quotidien).

**Architecture:** Trois colonnes `odds_*` sur `matches`. Une edge function Deno récupère l'orientation domicile/extérieur via `fixtures` puis les cotes via `odds` (paginé, filtré bookmaker 16 / bet 1) et upsert les cotes orientées comme la DB. Un cron pg_cron quotidien et un bouton admin déclenchent la fonction. Le front mappe les colonnes et rend un petit composant `MatchOdds.vue` sous le bloc équipes dans les trois cartes.

**Tech Stack:** Vue 3 (`<script setup>` + Pinia), TypeScript, Supabase (Postgres, Edge Functions Deno, pg_cron), API-Sports (`v3.football.api-sports.io`).

## Global Constraints

- Projet Supabase : ref `sazupuqxwrnvgzsdxkjg`, URL `https://sazupuqxwrnvgzsdxkjg.supabase.co`.
- API-Sports : host `v3.football.api-sports.io`, header `x-apisports-key`, secret `APISPORTS_KEY` (déjà configuré). League `1`, season `2026`. Bookmaker `16` (Unibet), bet `1` (Match Winner).
- Cotes stockées **orientées DB** : `odds_home` = cote de `home_team`. Détection du flip identique à `sync-wc26` (`norm()` + `TEAM_ALIAS`).
- Pas de framework de test dans ce repo : la vérification front = `npm run build` (lance `vue-tsc`) ; la vérification edge function = invocation réelle + contrôle SQL.
- Déploiement : migrations via MCP Supabase `apply_migration` (versionnées dans `supabase/migrations/`) ; edge functions via MCP Supabase `deploy_edge_function`.
- Commits fréquents, un par tâche. Messages en français, style conventional commits, terminés par la ligne `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- Affichage des cotes : visible quel que soit l'état du match (à venir, live, terminé), uniquement si les trois cotes sont non nulles.

## File Structure

- `supabase/migrations/20260619200000_add_odds_to_matches.sql` — **créer** — colonnes `odds_home/odds_draw/odds_away`.
- `supabase/functions/sync-odds/index.ts` — **créer** — edge function de récupération des cotes.
- `supabase/migrations/20260619210000_schedule_sync_odds_cron.sql` — **créer** — job pg_cron quotidien.
- `src/types/index.ts` — **modifier** — champs `oddsHome/oddsDraw/oddsAway` sur `Match`.
- `src/utils/match.ts` — **modifier** — mapping des colonnes dans `mapMatchRow`.
- `src/components/ui/MatchOdds.vue` — **créer** — composant d'affichage des cotes.
- `src/components/tabs/TabMatchs.vue` — **modifier** — insertion du composant dans les 3 cartes + bouton SYNC COTES.
- `src/stores/admin.ts` — **modifier** — action `syncOdds()` + état.

---

### Task 1: Migration — colonnes odds sur `matches`

**Files:**
- Create: `supabase/migrations/20260619200000_add_odds_to_matches.sql`

**Interfaces:**
- Produces: colonnes `public.matches.odds_home`, `.odds_draw`, `.odds_away` de type `numeric(6,2)`, nullable.

- [ ] **Step 1: Écrire la migration**

Créer `supabase/migrations/20260619200000_add_odds_to_matches.sql` :

```sql
-- Cotes pré-match (et pendant/après) du bookmaker Unibet (API-Sports id=16),
-- pari "Match Winner" (bet id=1), écrites par l'edge function sync-odds.
-- Orientées comme la DB : odds_home correspond à home_team. NULL = indisponible.
alter table public.matches
  add column if not exists odds_home numeric(6,2),
  add column if not exists odds_draw numeric(6,2),
  add column if not exists odds_away numeric(6,2);
```

- [ ] **Step 2: Appliquer la migration**

Appliquer via MCP Supabase `apply_migration` (project_id `sazupuqxwrnvgzsdxkjg`, name `add_odds_to_matches`, query = contenu du fichier).

- [ ] **Step 3: Vérifier que les colonnes existent**

Via MCP Supabase `execute_sql` :
```sql
select column_name, data_type, numeric_precision, numeric_scale
from information_schema.columns
where table_schema='public' and table_name='matches'
  and column_name in ('odds_home','odds_draw','odds_away')
order by column_name;
```
Attendu : 3 lignes, `data_type = numeric`, precision 6, scale 2.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260619200000_add_odds_to_matches.sql
git commit -m "feat(odds): add odds columns to matches

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Edge function `sync-odds`

**Files:**
- Create: `supabase/functions/sync-odds/index.ts`

**Interfaces:**
- Consumes: colonnes `odds_*` (Task 1) ; secret `APISPORTS_KEY`.
- Produces: endpoint `POST /functions/v1/sync-odds` renvoyant `{ synced: number }` ; écrit `odds_home/odds_draw/odds_away` sur `matches`.

- [ ] **Step 1: Écrire la fonction**

Créer `supabase/functions/sync-odds/index.ts` :

```ts
import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"

const APISPORTS_KEY = Deno.env.get('APISPORTS_KEY')
if (!APISPORTS_KEY) throw new Error('APISPORTS_KEY environment secret is not set')
const API_HOST = 'v3.football.api-sports.io'
const LEAGUE = 1
const SEASON = 2026
const BOOKMAKER = 16 // Unibet
const BET = 1        // Match Winner

// Mêmes alias que sync-wc26 : noms API-Football qui diffèrent de notre DB.
const TEAM_ALIAS: Record<string, string> = {
  'Türkiye': 'Turkey',
  'Cape Verde Islands': 'Cape Verde',
  'Congo DR': 'DR Congo',
  'Czechia': 'Czech Republic',
}
const norm = (n: string) => TEAM_ALIAS[n] ?? n

const apiFetch = (path: string) =>
  fetch(`https://${API_HOST}/${path}`, { headers: { 'x-apisports-key': APISPORTS_KEY } })

interface ApiFixture {
  fixture: { id: number }
  teams: { home: { name: string }; away: { name: string } }
}
interface OddValue { value: string; odd: string }
interface Bet { id: number; name: string; values: OddValue[] }
interface Bookmaker { id: number; name: string; bets: Bet[] }
interface OddsEntry { fixture: { id: number }; bookmakers: Bookmaker[] }

Deno.serve(async () => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  // 1. Nos matchs : id + home_team pour l'orientation
  const { data: dbMatches, error: dbErr } = await supabase
    .from('matches').select('id, home_team')
  if (dbErr) {
    return new Response(JSON.stringify({ error: dbErr.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    })
  }
  const homeById = new Map((dbMatches ?? []).map(m => [Number(m.id), m.home_team as string | null]))

  // 2. Orientation : la réponse /odds ne porte pas les noms d'équipes,
  //    on récupère l'équipe domicile API par fixture pour détecter le flip.
  const fxRes = await apiFetch(`fixtures?league=${LEAGUE}&season=${SEASON}`)
  if (!fxRes.ok) {
    return new Response(JSON.stringify({ error: 'fixtures fetch failed', status: fxRes.status }), {
      status: 502, headers: { 'Content-Type': 'application/json' },
    })
  }
  const { response: fixtures }: { response: ApiFixture[] } = await fxRes.json()
  const apiHomeById = new Map(fixtures.map(f => [f.fixture.id, norm(f.teams.home.name)]))

  // 3. Cotes paginées (filtrées bookmaker + bet côté API)
  const rows: Record<string, unknown>[] = []
  let page = 1
  let totalPages = 1
  do {
    const res = await apiFetch(`odds?league=${LEAGUE}&season=${SEASON}&bookmaker=${BOOKMAKER}&bet=${BET}&page=${page}`)
    if (!res.ok) {
      return new Response(JSON.stringify({ error: 'odds fetch failed', status: res.status, page }), {
        status: 502, headers: { 'Content-Type': 'application/json' },
      })
    }
    const json: { response: OddsEntry[]; paging?: { current: number; total: number } } = await res.json()
    totalPages = json.paging?.total ?? 1

    for (const entry of json.response ?? []) {
      const id = entry.fixture.id
      if (!homeById.has(id)) continue // fixture inconnu de notre DB

      const bet = entry.bookmakers?.[0]?.bets?.[0]
      if (!bet?.values?.length) continue

      const find = (v: string) => bet.values.find(x => x.value === v)?.odd
      const home = parseFloat(find('Home') ?? '')
      const draw = parseFloat(find('Draw') ?? '')
      const away = parseFloat(find('Away') ?? '')
      // N'écrire que si les trois cotes sont valides (jamais de NULL involontaire)
      if (!Number.isFinite(home) || !Number.isFinite(draw) || !Number.isFinite(away)) continue

      const flipped = apiHomeById.get(id) !== undefined && apiHomeById.get(id) !== homeById.get(id)
      rows.push({
        id,
        odds_home: flipped ? away : home,
        odds_draw: draw,
        odds_away: flipped ? home : away,
      })
    }
    page++
  } while (page <= totalPages)

  // 4. Upsert par lots, clés homogènes (id + 3 colonnes odds uniquement)
  for (let i = 0; i < rows.length; i += 100) {
    const { error } = await supabase.from('matches').upsert(rows.slice(i, i + 100), { onConflict: 'id' })
    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500, headers: { 'Content-Type': 'application/json' },
      })
    }
  }

  return new Response(JSON.stringify({ synced: rows.length }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
```

- [ ] **Step 2: Déployer la fonction**

Déployer via MCP Supabase `deploy_edge_function` (project_id `sazupuqxwrnvgzsdxkjg`, name `sync-odds`, fichier `index.ts` ci-dessus).

- [ ] **Step 3: Invoquer la fonction et vérifier la réponse**

```bash
curl -s -X POST https://sazupuqxwrnvgzsdxkjg.supabase.co/functions/v1/sync-odds \
  -H "Content-Type: application/json" -d '{}'
```
Attendu : JSON `{"synced": N}` avec `N >= 0` (et > 0 si des cotes Unibet sont disponibles pour la saison à cette date). Pas de champ `error`.

- [ ] **Step 4: Vérifier les cotes écrites en DB**

Via MCP Supabase `execute_sql` :
```sql
select id, home_team, away_team, odds_home, odds_draw, odds_away
from public.matches
where odds_home is not null
order by id limit 10;
```
Attendu : lignes avec 3 cotes numériques cohérentes (ex. favori = cote la plus basse). Si `synced` valait 0 (aucune cote dispo côté API à cette date), aucune ligne — c'est acceptable, l'orientation/écriture sera revérifiée plus tard.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/sync-odds/index.ts
git commit -m "feat(odds): add sync-odds edge function (Unibet match winner)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Cron quotidien `sync-odds-daily`

**Files:**
- Create: `supabase/migrations/20260619210000_schedule_sync_odds_cron.sql`

**Interfaces:**
- Consumes: endpoint `sync-odds` (Task 2).
- Produces: job pg_cron `sync-odds-daily`.

- [ ] **Step 1: Écrire la migration**

Créer `supabase/migrations/20260619210000_schedule_sync_odds_cron.sql` :

```sql
-- Rafraîchit quotidiennement les cotes Unibet via l'edge function sync-odds.
-- Calqué sur le job sync-wc26-every-minute. 06:00 UTC.
select cron.schedule(
  'sync-odds-daily',
  '0 6 * * *',
  $$
  select net.http_post(
    url := 'https://sazupuqxwrnvgzsdxkjg.supabase.co/functions/v1/sync-odds',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);
```

- [ ] **Step 2: Appliquer la migration**

Appliquer via MCP Supabase `apply_migration` (name `schedule_sync_odds_cron`, query = contenu du fichier).

- [ ] **Step 3: Vérifier que le job existe**

Via MCP Supabase `execute_sql` :
```sql
select jobname, schedule from cron.job where jobname = 'sync-odds-daily';
```
Attendu : 1 ligne, `schedule = '0 6 * * *'`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260619210000_schedule_sync_odds_cron.sql
git commit -m "feat(odds): schedule daily sync-odds cron job

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Type `Match` + mapping `mapMatchRow`

**Files:**
- Modify: `src/types/index.ts` (interface `Match`)
- Modify: `src/utils/match.ts` (`mapMatchRow`)

**Interfaces:**
- Produces: `Match.oddsHome / oddsDraw / oddsAway: number | null`, peuplés par `mapMatchRow`.

- [ ] **Step 1: Ajouter les champs au type `Match`**

Dans `src/types/index.ts`, à la fin de l'interface `Match` (après `liveExtra: number | null`) :

```ts
  // Cotes Unibet "vainqueur du match" (1/N/2), orientées DB. null si indisponible.
  oddsHome: number | null
  oddsDraw: number | null
  oddsAway: number | null
```

- [ ] **Step 2: Mapper les colonnes dans `mapMatchRow`**

Dans `src/utils/match.ts`, dans l'objet retourné par `mapMatchRow`, juste après la ligne `liveExtra: ...` :

```ts
    oddsHome: r.odds_home !== null && r.odds_home !== undefined ? Number(r.odds_home) : null,
    oddsDraw: r.odds_draw !== null && r.odds_draw !== undefined ? Number(r.odds_draw) : null,
    oddsAway: r.odds_away !== null && r.odds_away !== undefined ? Number(r.odds_away) : null,
```

- [ ] **Step 3: Vérifier le typecheck**

Run: `npm run build`
Attendu : build réussi, aucune erreur TypeScript (`vue-tsc`). Le build doit passer car tous les usages de `mapMatchRow` reçoivent désormais un `Match` complet.

- [ ] **Step 4: Commit**

```bash
git add src/types/index.ts src/utils/match.ts
git commit -m "feat(odds): map odds columns onto Match type

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: Composant `MatchOdds.vue`

**Files:**
- Create: `src/components/ui/MatchOdds.vue`

**Interfaces:**
- Consumes: `Match` (Task 4), `C` depuis `src/constants/ui`.
- Produces: composant `MatchOdds` avec prop `match: Match`. Ne rend rien si une des 3 cotes est nulle.

- [ ] **Step 1: Écrire le composant**

Créer `src/components/ui/MatchOdds.vue` :

```vue
<script setup lang="ts">
import { computed } from 'vue'
import type { Match } from '../../types'
import { C } from '../../constants/ui'

const props = defineProps<{ match: Match }>()

const show = computed(() =>
  props.match.oddsHome != null && props.match.oddsDraw != null && props.match.oddsAway != null
)

// Indice de la cote la plus basse (favori) parmi [home, draw, away]
const favouriteIdx = computed(() => {
  const o = [props.match.oddsHome, props.match.oddsDraw, props.match.oddsAway] as number[]
  let best = 0
  for (let i = 1; i < o.length; i++) if (o[i] < o[best]) best = i
  return best
})

function fmt(v: number | null) { return v == null ? '' : v.toFixed(2) }
</script>

<template>
  <div v-if="show" style="margin-bottom: 14px">
    <div style="display: grid; grid-template-columns: 1fr auto 1fr; gap: 8px; align-items: center; text-align: center">
      <span class="anton" :style="{ fontSize: '15px', letterSpacing: '0.5px', color: favouriteIdx === 0 ? C.accent : '#94a3b8' }">{{ fmt(match.oddsHome) }}</span>
      <span class="anton" :style="{ fontSize: '15px', letterSpacing: '0.5px', padding: '0 6px', color: favouriteIdx === 1 ? C.accent : '#94a3b8' }">{{ fmt(match.oddsDraw) }}</span>
      <span class="anton" :style="{ fontSize: '15px', letterSpacing: '0.5px', color: favouriteIdx === 2 ? C.accent : '#94a3b8' }">{{ fmt(match.oddsAway) }}</span>
    </div>
    <div style="text-align: center; font-size: 9px; color: #475569; letter-spacing: 1px; margin-top: 2px; text-transform: uppercase">Cotes Unibet · 1 N 2</div>
  </div>
</template>
```

- [ ] **Step 2: Vérifier le typecheck**

Run: `npm run build`
Attendu : build réussi. (Le composant n'est pas encore utilisé — on vérifie juste qu'il compile.)

> Note : si `C.accent` n'existe pas dans `src/constants/ui.ts`, utiliser la clé de couleur d'accent réellement présente (vérifier le fichier ; les autres composants y référencent `C.accent`/`C.muted`/`C.green`/etc.).

- [ ] **Step 3: Commit**

```bash
git add src/components/ui/MatchOdds.vue
git commit -m "feat(odds): add MatchOdds display component

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: Intégrer `MatchOdds` dans les 3 cartes de `TabMatchs.vue`

**Files:**
- Modify: `src/components/tabs/TabMatchs.vue` (import + 3 insertions)

**Interfaces:**
- Consumes: `MatchOdds` (Task 5).

- [ ] **Step 1: Importer le composant**

Dans le `<script setup>` de `src/components/tabs/TabMatchs.vue`, après l'import de `LineupModal` (ligne ~11) :

```ts
import MatchOdds from '../ui/MatchOdds.vue'
```

- [ ] **Step 2: Insérer dans la carte LIVE / programme**

Dans la carte live, juste après la fermeture du bloc équipes (la `</div>` qui ferme le `grid-template-columns: 1fr auto 1fr` se terminant par `margin-bottom: 14px`, autour de la ligne 384) et **avant** le commentaire `<!-- Pronostic + résultat -->` :

```html
            <MatchOdds :match="m" />
```

- [ ] **Step 3: Insérer dans la carte KO**

Dans la carte knockout, après la fermeture du bloc équipes (autour de la ligne 519) et **avant** le commentaire `<!-- Pronostic + résultat (seulement si les deux équipes sont connues) -->` :

```html
        <MatchOdds :match="m" />
```

- [ ] **Step 4: Insérer dans la carte Groupe**

Dans la carte group, après la fermeture du bloc équipes (le `grid` `1fr auto 1fr`, autour de la ligne 700+) et avant le bloc pronostic/résultat. Repérer la `</div>` fermant le grid des équipes du groupe (lire `src/components/tabs/TabMatchs.vue` autour des lignes 665-720 pour localiser précisément), puis insérer :

```html
        <MatchOdds :match="m" />
```

- [ ] **Step 5: Vérifier le typecheck/build**

Run: `npm run build`
Attendu : build réussi, aucune erreur.

- [ ] **Step 6: Vérification visuelle**

Run: `npm run dev`, ouvrir l'app, onglet MATCHS. Pour un match disposant de cotes (vérifié en Task 2), la ligne `2.10  3.40  3.20` + « Cotes Unibet · 1 N 2 » s'affiche sous les drapeaux dans les vues Live, Groupes et Élimination. Pour un match sans cotes, rien ne s'affiche (pas d'espace vide notable).

- [ ] **Step 7: Commit**

```bash
git add src/components/tabs/TabMatchs.vue
git commit -m "feat(odds): show match odds under teams in all match cards

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 7: Bouton admin SYNC COTES

**Files:**
- Modify: `src/stores/admin.ts` (action `syncOdds` + état + export)
- Modify: `src/components/tabs/TabMatchs.vue` (bouton dans la barre admin)

**Interfaces:**
- Consumes: endpoint `sync-odds` (Task 2), `mapMatchRow`.
- Produces: `admin.syncOdds()`, `admin.oddsLoading`, `admin.oddsMsg`.

- [ ] **Step 1: Ajouter l'action au store admin**

Dans `src/stores/admin.ts`, après le bloc `syncFromApi` (avant le `return`), ajouter (calqué sur `syncSchedule`) :

```ts
  const oddsLoading = ref(false)
  const oddsMsg     = ref('')
  let oddsMsgTimer: ReturnType<typeof setTimeout> | null = null

  async function syncOdds() {
    const matchesStore = useMatchesStore()
    oddsLoading.value = true
    oddsMsg.value = ''
    try {
      const { data, error } = await sb.functions.invoke('sync-odds')
      if (error) throw error
      const result = data as { synced: number }
      oddsMsg.value = `✓ ${result.synced} cote(s) synchronisée(s)`
      const { data: mData } = await sb.from('matches').select('*').order('id')
      matchesStore.matches = (mData || []).map(mapMatchRow)
    } catch (e) {
      oddsMsg.value = '✗ ' + (e as Error).message
    } finally {
      oddsLoading.value = false
      if (oddsMsgTimer) clearTimeout(oddsMsgTimer)
      oddsMsgTimer = setTimeout(() => { oddsMsg.value = '' }, 3000)
    }
  }
```

- [ ] **Step 2: Exporter l'action et l'état**

Dans le `return { ... }` final de `src/stores/admin.ts`, ajouter avant la `}` de fermeture :

```ts
    , oddsLoading, oddsMsg, syncOdds
```

(Insérer en respectant la syntaxe existante : ajouter `oddsLoading, oddsMsg, syncOdds` à la liste exportée.)

- [ ] **Step 3: Ajouter le bouton dans la barre admin**

Dans `src/components/tabs/TabMatchs.vue`, dans le bloc `<div v-if="admin.isAdmin" ...>` (barre des boutons sync, ~ligne 306-323), après le bouton SYNC HORAIRES et avant les `<span>` de messages, ajouter :

```html
      <button
        :disabled="admin.oddsLoading"
        :style="{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px', background: 'linear-gradient(135deg, #0f172a, #1e293b)', border: '1px solid rgba(245,158,11,0.4)', borderRadius: '8px', cursor: admin.oddsLoading ? 'not-allowed' : 'pointer', fontFamily: 'Anton, sans-serif', fontSize: '11px', letterSpacing: '1px', color: '#f59e0b', opacity: admin.oddsLoading ? 0.6 : 1 }"
        @click="admin.syncOdds()">
        <span>{{ admin.oddsLoading ? '⏳' : '💰' }}</span>
        {{ admin.oddsLoading ? 'SYNC…' : 'SYNC COTES' }}
      </button>
```

Puis, à côté des autres `<span>` de messages (après `admin.scheduleMsg`) :

```html
      <span v-if="admin.oddsMsg" style="font-size: 11px; color: #f59e0b">{{ admin.oddsMsg }}</span>
```

- [ ] **Step 4: Vérifier le build**

Run: `npm run build`
Attendu : build réussi, aucune erreur.

- [ ] **Step 5: Vérification fonctionnelle**

Run: `npm run dev`, passer en mode admin (mot de passe `GOAT` via la modale admin), onglet MATCHS. Cliquer **💰 SYNC COTES** : le message `✓ N cote(s) synchronisée(s)` apparaît, et les cotes s'affichent/se rafraîchissent sur les cartes.

- [ ] **Step 6: Commit**

```bash
git add src/stores/admin.ts src/components/tabs/TabMatchs.vue
git commit -m "feat(odds): add SYNC COTES admin button

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage :**
- §1 Modèle de données → Task 1. ✓
- §2 Edge function (orientation, cotes paginées, upsert, garde-fous) → Task 2. ✓
- §3 Cron quotidien 06:00 UTC → Task 3. ✓
- §4 Bouton admin → Task 7. ✓
- §5 Affichage (type+mapping, composant factorisé, condition « 3 cotes présentes », visible quel que soit l'état du match, intégration 3 cartes) → Tasks 4, 5, 6. ✓

**Placeholder scan :** Code complet à chaque étape. Les seules instructions de repérage (« lire autour des lignes X ») concernent la localisation exacte d'insertion dans un gros fichier Vue existant (TabMatchs.vue ~800 lignes) ; le contenu à insérer est fourni en entier.

**Type consistency :** `oddsHome/oddsDraw/oddsAway: number | null` (Task 4) cohérents entre `Match`, `mapMatchRow`, `MatchOdds.vue` (Task 5) et l'usage dans `TabMatchs.vue` (Task 6). Colonnes DB `odds_home/odds_draw/odds_away` (Task 1) cohérentes avec l'upsert de l'edge function (Task 2) et le mapping (Task 4). `admin.syncOdds/oddsLoading/oddsMsg` (Task 7) cohérents entre store et template.
