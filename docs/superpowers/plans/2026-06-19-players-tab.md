# Onglet « JOUEURS » Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajouter un onglet « Joueurs » où l'on recherche un joueur (table `players`) et l'on affiche ses statistiques Coupe du Monde 2026 issues d'API-Football, par catégories.

**Architecture:** Une edge function proxy (`player-stats-proxy`) appelle `/players?id={apiId}&league=1&season=2026` côté serveur et renvoie un objet normalisé. Le composant `TabJoueurs.vue` branche le `PlayerSearch` existant (étendu pour émettre l'`api_id`) sur cette function et rend une fiche par catégories. L'onglet est ajouté en fin de barre (index 5).

**Tech Stack:** Vue 3 (`<script setup>`), Pinia, Supabase JS (`sb.functions.invoke`), Deno edge function, API-Football v3.

## Global Constraints

- Clé API **jamais** côté client : tout passe par l'edge function (`x-apisports-key` côté serveur).
- Périmètre stats : `LEAGUE = 1`, `SEASON = 2026` (WC26 uniquement).
- Pas de test runner dans le repo (`package.json` n'a que `dev`/`build`/`preview`). Vérification = `curl` pour l'edge function, `npm run build` (vue-tsc) pour le front, contrôle navigateur pour l'UI. Ne pas introduire vitest/jest.
- Style : réutiliser `sCard`, `C` (`src/constants/ui.ts`), `getFlag` (`src/utils/ui.ts`), police Anton pour les titres. Thème sombre existant.
- Champs API à orthographe piégeuse, à copier tels quels : `games.appearences`, `penalty.commited`. Les cartons rouges = `cards.red + cards.yellowred`.
- Projet Supabase ref : `sazupuqxwrnvgzsdxkjg`.

---

## File Structure

- **Create** `supabase/functions/player-stats-proxy/index.ts` — edge function : fetch `/players`, normalise, renvoie `{ data: PlayerStats | null }`.
- **Modify** `src/components/ui/PlayerSearch.vue` — ajoute `api_id` au select + émet `@select` (non-cassant).
- **Create** `src/components/tabs/TabJoueurs.vue` — recherche + fiche stats par catégories.
- **Modify** `src/constants/ui.ts` — ajoute `"Joueurs"` à `TABS`.
- **Modify** `src/App.vue` — import + `v-else-if="app.tab === 5"`.

---

## Task 1: Edge function `player-stats-proxy`

**Files:**
- Create: `supabase/functions/player-stats-proxy/index.ts`

**Interfaces:**
- Consumes: rien (point d'entrée).
- Produces: réponse HTTP JSON `{ data: PlayerStats | null }` où
  ```ts
  interface PlayerStats {
    profile: { name: string; photo: string | null; age: number | null;
      nationality: string | null; height: string | null; weight: string | null; injured: boolean }
    stats: { appearances: number; lineups: number; minutes: number; position: string; rating: string | null;
      shotsTotal: number | null; shotsOn: number | null; goals: number; assists: number;
      passesTotal: number | null; passesKey: number | null; passesAccuracy: number | null;
      dribblesAttempts: number | null; dribblesSuccess: number | null;
      tacklesTotal: number | null; interceptions: number | null; blocks: number | null;
      duelsTotal: number | null; duelsWon: number | null;
      foulsDrawn: number | null; foulsCommitted: number | null; yellow: number; red: number;
      penWon: number | null; penScored: number | null; penMissed: number | null }
  }
  ```
  Corps de requête attendu : `{ apiId: number }`.

- [ ] **Step 1: Créer le fichier de l'edge function**

Create `supabase/functions/player-stats-proxy/index.ts` :

```ts
import "jsr:@supabase/functions-js/edge-runtime.d.ts"

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const APISPORTS_KEY = Deno.env.get('APISPORTS_KEY') ?? '<APISPORTS_KEY>'
const API_HOST = 'v3.football.api-sports.io'
const LEAGUE = 1
const SEASON = 2026

interface ApiPlayer {
  player: {
    name: string; age: number | null; nationality: string | null
    height: string | null; weight: string | null; injured: boolean; photo: string | null
  }
  statistics: ApiStat[]
}
interface ApiStat {
  league: { id: number }
  games: { appearences: number | null; lineups: number | null; minutes: number | null; position: string | null; rating: string | null }
  shots: { total: number | null; on: number | null }
  goals: { total: number | null; assists: number | null }
  passes: { total: number | null; key: number | null; accuracy: number | null }
  tackles: { total: number | null; blocks: number | null; interceptions: number | null }
  duels: { total: number | null; won: number | null }
  dribbles: { attempts: number | null; success: number | null }
  fouls: { drawn: number | null; committed: number | null }
  cards: { yellow: number | null; yellowred: number | null; red: number | null }
  penalty: { won: number | null; scored: number | null; missed: number | null }
}

const apiFetch = (path: string) =>
  fetch(`https://${API_HOST}/${path}`, { headers: { 'x-apisports-key': APISPORTS_KEY } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

  let apiId: unknown
  try { apiId = (await req.json())?.apiId } catch { /* no/invalid body */ }
  if (typeof apiId !== 'number') return json({ error: 'apiId (number) required' }, 400)

  let api: ApiPlayer | undefined
  try {
    const res = await apiFetch(`players?id=${apiId}&league=${LEAGUE}&season=${SEASON}`)
    if (res.ok) {
      const { response } = await res.json() as { response: ApiPlayer[] }
      api = Array.isArray(response) ? response[0] : undefined
    }
  } catch { /* fall through to null */ }

  if (!api) return json({ data: null })

  // Ligne de stats WC26 (league 1) ; repli sur la seule ligne présente.
  const stat = api.statistics.find(s => s.league?.id === LEAGUE) ?? api.statistics[0]
  if (!stat) return json({ data: null })

  const data = {
    profile: {
      name: api.player.name,
      photo: api.player.photo,
      age: api.player.age,
      nationality: api.player.nationality,
      height: api.player.height,
      weight: api.player.weight,
      injured: api.player.injured,
    },
    stats: {
      appearances: stat.games?.appearences ?? 0,
      lineups: stat.games?.lineups ?? 0,
      minutes: stat.games?.minutes ?? 0,
      position: stat.games?.position ?? '',
      rating: stat.games?.rating ?? null,
      shotsTotal: stat.shots?.total ?? null,
      shotsOn: stat.shots?.on ?? null,
      goals: stat.goals?.total ?? 0,
      assists: stat.goals?.assists ?? 0,
      passesTotal: stat.passes?.total ?? null,
      passesKey: stat.passes?.key ?? null,
      passesAccuracy: stat.passes?.accuracy ?? null,
      dribblesAttempts: stat.dribbles?.attempts ?? null,
      dribblesSuccess: stat.dribbles?.success ?? null,
      tacklesTotal: stat.tackles?.total ?? null,
      interceptions: stat.tackles?.interceptions ?? null,
      blocks: stat.tackles?.blocks ?? null,
      duelsTotal: stat.duels?.total ?? null,
      duelsWon: stat.duels?.won ?? null,
      foulsDrawn: stat.fouls?.drawn ?? null,
      foulsCommitted: stat.fouls?.committed ?? null,
      yellow: stat.cards?.yellow ?? 0,
      red: (stat.cards?.red ?? 0) + (stat.cards?.yellowred ?? 0),
      penWon: stat.penalty?.won ?? null,
      penScored: stat.penalty?.scored ?? null,
      penMissed: stat.penalty?.missed ?? null,
    },
  }

  return json({ data })
})
```

- [ ] **Step 2: Déployer l'edge function**

Run: `npx supabase functions deploy player-stats-proxy --project-ref sazupuqxwrnvgzsdxkjg`
Expected: `Deployed Functions on project sazupuqxwrnvgzsdxkjg: player-stats-proxy`.

- [ ] **Step 3: Tester le chemin nominal (joueur avec stats WC26)**

Run:
```bash
curl -s -X POST \
  "https://sazupuqxwrnvgzsdxkjg.supabase.co/functions/v1/player-stats-proxy" \
  -H "Content-Type: application/json" \
  -d '{"apiId":1271}'
```
Expected : JSON `{"data":{"profile":{"name":"A. Tchouaméni",...},"stats":{"appearances":1,"lineups":1,"minutes":90,"position":"Midfielder","rating":"7.3",...,"goals":0,"assists":0,...}}}`. La clé `data` est non-`null` et contient `profile` + `stats`.

- [ ] **Step 4: Tester le chemin sans données (id inexistant)**

Run:
```bash
curl -s -X POST \
  "https://sazupuqxwrnvgzsdxkjg.supabase.co/functions/v1/player-stats-proxy" \
  -H "Content-Type: application/json" \
  -d '{"apiId":99999999}'
```
Expected : `{"data":null}` (aucune erreur 500).

- [ ] **Step 5: Tester la validation d'entrée**

Run:
```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST \
  "https://sazupuqxwrnvgzsdxkjg.supabase.co/functions/v1/player-stats-proxy" \
  -H "Content-Type: application/json" -d '{}'
```
Expected : `400`.

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/player-stats-proxy/index.ts
git commit -m "feat(players): add player-stats-proxy edge function for per-player WC26 stats"
```

---

## Task 2: Étendre `PlayerSearch.vue` pour émettre l'`api_id`

**Files:**
- Modify: `src/components/ui/PlayerSearch.vue`

**Interfaces:**
- Consumes: table `players` (`name, team, api_id`).
- Produces: émit `(e: 'select', player: { name: string; team: string; api_id: number }): void`, en plus de l'émit existant `(e: 'update', val: string)`. `TabJoueurs` (Task 3) consomme `@select`.

- [ ] **Step 1: Étendre l'interface `PlayerRow` et le select Supabase**

Dans `src/components/ui/PlayerSearch.vue`, remplacer la ligne :

```ts
interface PlayerRow { name: string; team: string }
```
par :
```ts
interface PlayerRow { name: string; team: string; api_id: number }
```

Et dans `search()`, remplacer :
```ts
  const { data } = await sb.from('players')
    .select('name, team')
```
par :
```ts
  const { data } = await sb.from('players')
    .select('name, team, api_id')
```

- [ ] **Step 2: Déclarer l'émit `select` et l'émettre à la sélection**

Remplacer la déclaration d'émits :
```ts
const emit = defineEmits<{ (e: 'update', val: string): void }>()
```
par :
```ts
const emit = defineEmits<{
  (e: 'update', val: string): void
  (e: 'select', player: PlayerRow): void
}>()
```

Puis, dans la fonction `select(p)`, ajouter l'émit `select` après l'émit `update` existant :
```ts
function select(p: PlayerRow) {
  query.value = p.name
  emit('update', p.name)
  emit('select', p)
  open.value = false
  results.value = []
}
```

- [ ] **Step 3: Vérifier le build (types OK, TabBonus non cassé)**

Run: `npm run build`
Expected : build réussit sans erreur de type. `TabBonus.vue` (qui n'utilise que `@update`) compile toujours.

- [ ] **Step 4: Commit**

```bash
git add src/components/ui/PlayerSearch.vue
git commit -m "feat(players): emit @select with api_id from PlayerSearch"
```

---

## Task 3: Composant `TabJoueurs.vue` + câblage de l'onglet

**Files:**
- Create: `src/components/tabs/TabJoueurs.vue`
- Modify: `src/constants/ui.ts`
- Modify: `src/App.vue`

**Interfaces:**
- Consumes: `PlayerSearch` `@select` (Task 2) ; edge function `player-stats-proxy` renvoyant `{ data: PlayerStats | null }` (Task 1).
- Produces: onglet index 5 affiché par `App.vue`.

- [ ] **Step 1: Créer `TabJoueurs.vue`**

Create `src/components/tabs/TabJoueurs.vue` :

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { sb } from '../../supabase'
import { sCard } from '../../constants/ui'
import { getFlag } from '../../utils/ui'
import PlayerSearch from '../ui/PlayerSearch.vue'

interface PlayerStats {
  profile: {
    name: string; photo: string | null; age: number | null
    nationality: string | null; height: string | null; weight: string | null; injured: boolean
  }
  stats: {
    appearances: number; lineups: number; minutes: number; position: string; rating: string | null
    shotsTotal: number | null; shotsOn: number | null; goals: number; assists: number
    passesTotal: number | null; passesKey: number | null; passesAccuracy: number | null
    dribblesAttempts: number | null; dribblesSuccess: number | null
    tacklesTotal: number | null; interceptions: number | null; blocks: number | null
    duelsTotal: number | null; duelsWon: number | null
    foulsDrawn: number | null; foulsCommitted: number | null; yellow: number; red: number
    penWon: number | null; penScored: number | null; penMissed: number | null
  }
}

interface SelectedPlayer { name: string; team: string; api_id: number }

const selected = ref<SelectedPlayer | null>(null)
const data = ref<PlayerStats | null>(null)
const loading = ref(false)
const error = ref<string | null>(null)
const cache = new Map<number, PlayerStats | null>()

const POSITION_FR: Record<string, string> = {
  Goalkeeper: 'Gardien', Defender: 'Défenseur', Midfielder: 'Milieu', Attacker: 'Attaquant',
}

async function onSelect(p: SelectedPlayer) {
  selected.value = p
  error.value = null
  if (cache.has(p.api_id)) { data.value = cache.get(p.api_id) ?? null; return }
  loading.value = true
  data.value = null
  try {
    const { data: res, error: err } = await sb.functions.invoke('player-stats-proxy', { body: { apiId: p.api_id } })
    if (err) throw err
    const stats = (res as { data: PlayerStats | null }).data
    cache.set(p.api_id, stats)
    data.value = stats
  } catch (e) {
    error.value = (e as Error).message
    data.value = null
  } finally {
    loading.value = false
  }
}

const fmt = (v: number | string | null) => v === null || v === '' ? '—' : String(v)
const pct = (v: number | null) => v === null ? '—' : v + '%'
const posFr = (p: string) => POSITION_FR[p] ?? (p || '—')

function sections(s: PlayerStats['stats']): { label: string; icon: string; rows: [string, string][] }[] {
  return [
    { label: 'Temps de jeu', icon: '⏱️', rows: [
      ['Matchs joués', fmt(s.appearances)], ['Titularisations', fmt(s.lineups)],
      ['Minutes', fmt(s.minutes)], ['Poste', posFr(s.position)], ['Note moyenne', fmt(s.rating)],
    ] },
    { label: 'Attaque', icon: '⚽', rows: [
      ['Tirs', fmt(s.shotsTotal)], ['Tirs cadrés', fmt(s.shotsOn)],
      ['Buts', fmt(s.goals)], ['Passes décisives', fmt(s.assists)],
    ] },
    { label: 'Construction', icon: '🎯', rows: [
      ['Passes', fmt(s.passesTotal)], ['Passes clés', fmt(s.passesKey)],
      ['Précision passes', pct(s.passesAccuracy)],
      ['Dribbles tentés', fmt(s.dribblesAttempts)], ['Dribbles réussis', fmt(s.dribblesSuccess)],
    ] },
    { label: 'Défense', icon: '🛡️', rows: [
      ['Tacles', fmt(s.tacklesTotal)], ['Interceptions', fmt(s.interceptions)],
      ['Contres', fmt(s.blocks)], ['Duels', fmt(s.duelsTotal)], ['Duels gagnés', fmt(s.duelsWon)],
    ] },
    { label: 'Discipline', icon: '🟨', rows: [
      ['Fautes subies', fmt(s.foulsDrawn)], ['Fautes commises', fmt(s.foulsCommitted)],
      ['Cartons jaunes', fmt(s.yellow)], ['Cartons rouges', fmt(s.red)],
    ] },
    { label: 'Penalties', icon: '🥅', rows: [
      ['Obtenus', fmt(s.penWon)], ['Marqués', fmt(s.penScored)], ['Ratés', fmt(s.penMissed)],
    ] },
  ]
}
</script>

<template>
  <div>
    <div style="margin-bottom: 14px">
      <PlayerSearch @select="onSelect" />
    </div>

    <!-- idle -->
    <div v-if="!selected" :style="{ ...sCard, textAlign: 'center', padding: '40px 20px' }">
      <div style="font-size: 40px; margin-bottom: 12px">🔎</div>
      <div style="font-family: Anton, sans-serif; font-size: 14px; color: #475569; letter-spacing: 1px">RECHERCHE UN JOUEUR</div>
      <div style="font-size: 12px; color: #334155; margin-top: 8px">Tape un nom pour voir ses statistiques de la Coupe du Monde 2026.</div>
    </div>

    <template v-else>
      <!-- header -->
      <div :style="{ ...sCard, display: 'flex', alignItems: 'center', gap: '14px' }">
        <img v-if="data?.profile.photo" :src="data.profile.photo" :alt="selected.name"
          style="width: 64px; height: 64px; border-radius: 50%; object-fit: cover; border: 2px solid #1e293b; background: #0a0e1a" />
        <div v-else style="width: 64px; height: 64px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 28px; background: #0a0e1a; border: 2px solid #1e293b">👤</div>
        <div style="min-width: 0">
          <div style="font-family: Anton, sans-serif; font-size: 20px; color: #f8fafc; letter-spacing: 0.5px">{{ data?.profile.name ?? selected.name }}</div>
          <div style="font-size: 12px; color: #94a3b8; margin-top: 2px">
            <span class="flag">{{ getFlag(selected.team) }}</span> {{ selected.team }}
            <template v-if="data?.profile.age"> · {{ data.profile.age }} ans</template>
          </div>
          <div v-if="data?.profile.injured" style="font-size: 11px; color: #ef4444; margin-top: 4px; font-weight: 600">⚠ Blessé</div>
        </div>
      </div>

      <!-- loading -->
      <div v-if="loading" style="display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 40px 0; gap: 14px">
        <div class="res-spinner"></div>
        <div style="font-size: 12px; color: #64748b; letter-spacing: 1px; font-family: Anton, sans-serif">CHARGEMENT…</div>
      </div>

      <!-- error -->
      <div v-else-if="error" style="text-align: center; padding: 30px; color: #ef4444; font-size: 13px">{{ error }}</div>

      <!-- no data -->
      <div v-else-if="!data" :style="{ ...sCard, textAlign: 'center', padding: '30px 20px' }">
        <div style="font-size: 32px; margin-bottom: 10px">📭</div>
        <div style="font-size: 13px; color: #94a3b8">Pas encore de statistiques sur cette Coupe du Monde.</div>
      </div>

      <!-- stats -->
      <template v-else>
        <div v-for="sec in sections(data.stats)" :key="sec.label" :style="sCard">
          <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 10px">
            <span style="font-size: 16px">{{ sec.icon }}</span>
            <span style="font-family: Anton, sans-serif; font-size: 14px; color: #f8fafc; letter-spacing: 1px">{{ sec.label.toUpperCase() }}</span>
          </div>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px 16px">
            <div v-for="row in sec.rows" :key="row[0]" style="display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid #1e293b; padding-bottom: 4px">
              <span style="font-size: 12px; color: #94a3b8">{{ row[0] }}</span>
              <span style="font-size: 13px; color: #f1f5f9; font-family: Anton, sans-serif">{{ row[1] }}</span>
            </div>
          </div>
        </div>
      </template>
    </template>
  </div>
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

- [ ] **Step 2: Ajouter l'onglet à `TABS`**

Dans `src/constants/ui.ts`, remplacer :
```ts
export const TABS = ["Participants", "Matchs", "Bonus", "Classement", "Statistiques"] as const
```
par :
```ts
export const TABS = ["Participants", "Matchs", "Bonus", "Classement", "Statistiques", "Joueurs"] as const
```

- [ ] **Step 3: Câbler le rendu dans `App.vue`**

Dans `src/App.vue`, après la ligne d'import :
```ts
import TabStats from './components/tabs/TabStats.vue'
```
ajouter :
```ts
import TabJoueurs from './components/tabs/TabJoueurs.vue'
```

Puis, dans le template, après :
```html
        <TabStats        v-else-if="app.tab === 4" />
```
ajouter :
```html
        <TabJoueurs      v-else-if="app.tab === 5" />
```

- [ ] **Step 4: Vérifier le build**

Run: `npm run build`
Expected : build réussit sans erreur de type.

- [ ] **Step 5: Contrôle navigateur**

Run: `npm run dev` puis ouvrir l'app, se connecter.
Vérifier :
1. Un onglet « Joueurs » apparaît en fin de barre ; le cliquer affiche l'invite de recherche.
2. Rechercher « Tchouam » → sélectionner « A. Tchouaméni » → la fiche s'affiche : en-tête (photo, drapeau France, âge) puis les 6 sections ; les champs `null` montrent `—`.
3. Rechercher un remplaçant non entré en jeu → carte « Pas encore de statistiques sur cette Coupe du Monde ».
4. Re-sélectionner Tchouaméni → la fiche réapparaît instantanément, **sans** nouvel appel réseau (onglet Network : un seul `player-stats-proxy` pour ce joueur).
5. Aller dans l'onglet « Bonus » et utiliser un champ de recherche de joueur (ex. top buteur) → la sélection remplit toujours le champ (non-régression de Task 2).

- [ ] **Step 6: Commit**

```bash
git add src/components/tabs/TabJoueurs.vue src/constants/ui.ts src/App.vue
git commit -m "feat(players): add JOUEURS tab with per-player WC26 stats fiche"
```

---

## Self-Review

**Spec coverage :**
- Recherche branchée sur `players` → Task 2 (PlayerSearch) + Task 3 (TabJoueurs).
- Stats API par catégories → Task 1 (proxy normalisé) + Task 3 (6 sections).
- WC26 uniquement (`league=1`, `season=2026`) → Task 1 constantes `LEAGUE`/`SEASON`.
- Clé API côté serveur → Task 1 edge function.
- État « pas de données » → Task 1 (`data: null`) + Task 3 (carte no-data).
- Cache mémoire par `api_id` → Task 3 `cache` Map.
- Onglet en fin de barre (index 5) → Task 3 Steps 2-3.
- Non-régression `TabBonus` → Task 2 Step 3 + Task 3 Step 5.5.
- `npm run build` passe → Task 2 Step 3, Task 3 Step 4.

**Placeholder scan :** aucun TODO/TBD ; tout le code (edge function, diffs PlayerSearch, composant complet) est fourni intégralement.

**Type consistency :** l'interface `PlayerStats` (profile + stats, mêmes noms de champs) est identique entre la sortie de Task 1 et la consommation de Task 3. L'émit `(e: 'select', player: { name, team, api_id })` de Task 2 correspond à `onSelect(p: SelectedPlayer)` de Task 3. Le corps `{ apiId }` envoyé par Task 3 correspond à `apiId` lu par Task 1. Index d'onglet 5 cohérent entre `TABS`, l'import et `app.tab === 5`.
