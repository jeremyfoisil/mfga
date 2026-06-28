# Intégration des pronostics de phase finale — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Insérer les matchs à élimination directe (Round of 32 → Finale) dans la table `matches` depuis api-sports, pour ouvrir les pronostics de phase finale, avec reprise quotidienne automatique des rounds suivants.

**Architecture:** Réécriture de l'edge function `sync-schedule` pour qu'elle interroge `fixtures?league=1&season=2026` (api-sports, même appel que `sync-wc26` → ids compatibles avec les scores live), mappe `league.round → stage` et upsert les matchs KO à colonnes homogènes (idempotent, ne touche jamais résultats/pronostics/cotes). Un job `pg_cron` quotidien la rejoue. Petit helper UI dérive le libellé d'entête KO du `stage` (pas de colonne `round`).

**Tech Stack:** Deno (Supabase Edge Functions), Postgres + pg_cron, Vue 3 + TypeScript (Vite), Supabase MCP (`deploy_edge_function`, `apply_migration`, `execute_sql`).

## Global Constraints

- **Source de données** : api-sports `v3.football.api-sports.io`, `fixtures?league=1&season=2026`, header `x-apisports-key: <APISPORTS_KEY env secret>`. NE PAS utiliser `wc26-live-football-api` (clé morte, mauvais espace d'ids).
- **Noms d'équipes en anglais**, normalisés via `TEAM_ALIAS`/`norm()` identiques à `sync-wc26`/`sync-odds` (`Türkiye→Turkey`, `Cape Verde Islands→Cape Verde`, `Congo DR→DR Congo`, `Czechia→Czech Republic`). La base stocke l'anglais.
- **Codes de stage** : exactement `r32`, `r16`, `qf`, `sf`, `3rd`, `final` (doivent matcher `KO_STAGES` dans `src/constants/ui.ts` et le filtre de `TabMatchs.vue`).
- **Project id Supabase** : `sazupuqxwrnvgzsdxkjg`. URL fonctions : `https://sazupuqxwrnvgzsdxkjg.supabase.co/functions/v1/<name>`.
- **Idempotence** : les upserts n'incluent JAMAIS `result_*`, `goals_*`, `cards_*`, `odds_*`, `live_status`. Colonnes homogènes sur toutes les lignes d'un batch.
- **Déploiement** : `sync-schedule` déployée avec `verify_jwt=false` (comme `sync-wc26`/`sync-odds`) pour que le cron `net.http_post` (sans Authorization) puisse l'appeler. Le bouton admin l'invoque avec le JWT utilisateur — compatible dans les deux cas.
- **Pas de test runner** dans ce dépôt : la vérification se fait par déploiement, invocation HTTP, requêtes SQL et `npm run build`.

---

### Task 1: Réécrire l'edge function `sync-schedule` (source api-sports, KO → stage)

**Files:**
- Modify (réécriture complète) : `supabase/functions/sync-schedule/index.ts`

**Interfaces:**
- Consomme : env secrets `APISPORTS_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (déjà configurés sur le projet).
- Produit : endpoint HTTP `POST /functions/v1/sync-schedule` renvoyant `{ synced: number, skippedUnknownRound: number }`. Écrit dans `matches` les colonnes `id, stage, group_id, home_team, away_team, home_label, away_label, match_date, match_time, venue`.

- [ ] **Step 1: Remplacer entièrement le contenu de `supabase/functions/sync-schedule/index.ts`**

```ts
import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"

const APISPORTS_KEY = Deno.env.get('APISPORTS_KEY')
if (!APISPORTS_KEY) throw new Error('APISPORTS_KEY environment secret is not set')
const API_HOST = 'v3.football.api-sports.io'
const LEAGUE = 1
const SEASON = 2026

// Mêmes alias que sync-wc26 / sync-odds : noms API-Football qui diffèrent de notre DB (anglais).
const TEAM_ALIAS: Record<string, string> = {
  'Türkiye': 'Turkey',
  'Cape Verde Islands': 'Cape Verde',
  'Congo DR': 'DR Congo',
  'Czechia': 'Czech Republic',
}
const norm = (n: string) => TEAM_ALIAS[n] ?? n

// league.round api-sports → code de stage KO. null pour la phase de poules ou un round inconnu.
function roundToStage(round: string): string | null {
  const r = round.toLowerCase()
  if (r.startsWith('group')) return null
  if (r.includes('round of 32')) return 'r32'
  if (r.includes('round of 16')) return 'r16'
  if (r.includes('quarter')) return 'qf'
  if (r.includes('semi')) return 'sf'
  if (r.includes('3rd place') || r.includes('third place')) return '3rd'
  if (r.includes('final')) return 'final' // après les exclusions ci-dessus
  return null
}

// Nom d'équipe encore indéterminé (placeholder de tableau, ex. "Winner Group A", "W73") ?
function isPlaceholder(name: string | null | undefined): boolean {
  if (!name) return true
  return /^(winner|loser|w\d|l\d|\d)/i.test(name.trim())
}

interface ApiFixture {
  fixture: { id: number; date: string; venue: { name: string | null } | null }
  league: { round: string }
  teams: { home: { name: string | null }; away: { name: string | null } }
}

// ISO "2026-06-28T19:00:00+00:00" → { date:"2026-06-28", time:"19:00:00+00" }
function splitIso(iso: string): { date: string; time: string } | null {
  const m = iso.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):\d{2}([+-]\d{2}):?\d{2}/)
  if (!m) return null
  return { date: m[1], time: `${m[2]}:${m[3]}:00${m[4]}` }
}

const apiFetch = (path: string) =>
  fetch(`https://${API_HOST}/${path}`, { headers: { 'x-apisports-key': APISPORTS_KEY } })

Deno.serve(async () => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const apiRes = await apiFetch(`fixtures?league=${LEAGUE}&season=${SEASON}`)
  if (!apiRes.ok) {
    return new Response(JSON.stringify({ error: 'fixtures fetch failed', status: apiRes.status }), {
      status: 502, headers: { 'Content-Type': 'application/json' },
    })
  }
  const { response: fixtures }: { response: ApiFixture[] } = await apiRes.json()

  const rows: Record<string, unknown>[] = []
  let skippedUnknownRound = 0

  for (const fx of fixtures) {
    const round = fx.league?.round ?? ''
    const stage = roundToStage(round)
    if (stage === null) {
      // poule → ignoré silencieusement ; round KO inconnu → compté pour diagnostic
      if (!round.toLowerCase().startsWith('group')) skippedUnknownRound++
      continue
    }

    const when = splitIso(fx.fixture?.date ?? '')
    const homeName = fx.teams?.home?.name ?? null
    const awayName = fx.teams?.away?.name ?? null
    const homeKnown = !isPlaceholder(homeName)
    const awayKnown = !isPlaceholder(awayName)

    rows.push({
      id: fx.fixture.id,
      stage,
      group_id: null,
      home_team:  homeKnown ? norm(homeName!) : null,
      away_team:  awayKnown ? norm(awayName!) : null,
      home_label: homeKnown ? null : (homeName || '?'),
      away_label: awayKnown ? null : (awayName || '?'),
      match_date: when?.date ?? null,
      match_time: when?.time ?? null,
      venue: fx.fixture?.venue?.name ?? null,
    })
  }

  for (let i = 0; i < rows.length; i += 50) {
    const { error } = await supabase.from('matches').upsert(rows.slice(i, i + 50), { onConflict: 'id' })
    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500, headers: { 'Content-Type': 'application/json' },
      })
    }
  }

  return new Response(JSON.stringify({ synced: rows.length, skippedUnknownRound }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
```

- [ ] **Step 2: Déployer la fonction (verify_jwt=false)**

Via l'outil MCP `mcp__plugin_supabase_supabase__deploy_edge_function` :
- `project_id`: `sazupuqxwrnvgzsdxkjg`
- `name`: `sync-schedule`
- `entrypoint_path`: `index.ts`
- `verify_jwt`: `false`
- `files`: `[{ name: "index.ts", content: <contenu du Step 1> }]`

Expected : réponse JSON avec `"status":"ACTIVE"` et `"verify_jwt":false`.

- [ ] **Step 3: Invoquer la fonction pour insérer les Round of 32**

Run:
```bash
curl -s 'https://sazupuqxwrnvgzsdxkjg.supabase.co/functions/v1/sync-schedule'
```
Expected : `{"synced":16,"skippedUnknownRound":0}` (16 matchs R32 disponibles au 28/06 ; `skippedUnknownRound` à 0).

- [ ] **Step 4: Vérifier les lignes insérées en base**

Via `mcp__plugin_supabase_supabase__execute_sql` (`project_id: sazupuqxwrnvgzsdxkjg`) :
```sql
select stage, count(*) n,
       count(*) filter (where home_team is not null and away_team is not null) both_known,
       min(match_date) min_date, max(match_date) max_date
from matches where stage <> 'group' group by stage order by stage;
```
Expected : une ligne `stage='r32'`, `n=16`, `both_known=16`, dates ≥ `2026-06-28`.

- [ ] **Step 5: Vérifier l'idempotence (ré-invocation ne casse rien)**

Saisir un résultat factice puis ré-invoquer et vérifier qu'il survit :
```sql
update matches set result_home=2, result_away=1 where stage='r32' order by id limit 1;
```
(Note : PostgREST/SQL — utiliser une sous-requête si `order by limit` non supporté en `update` :
`update matches set result_home=2, result_away=1 where id = (select id from matches where stage='r32' order by id limit 1);`)

Puis :
```bash
curl -s 'https://sazupuqxwrnvgzsdxkjg.supabase.co/functions/v1/sync-schedule'
```
Puis :
```sql
select id, result_home, result_away from matches where stage='r32' and result_home is not null;
```
Expected : le résultat `2:1` est toujours présent (l'upsert n'a pas touché `result_*`). Nettoyer ensuite :
```sql
update matches set result_home=null, result_away=null where stage='r32';
```

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/sync-schedule/index.ts
git commit -m "feat(prono): sync-schedule pioche les matchs KO depuis api-sports

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Cron quotidien `sync-schedule-daily` (08:00 Paris)

**Files:**
- Create: `supabase/migrations/20260628000000_schedule_sync_schedule_cron.sql`

**Interfaces:**
- Consomme : endpoint `POST /functions/v1/sync-schedule` (Task 1), extensions `pg_cron` + `pg_net` (déjà utilisées par `sync-odds-daily`).
- Produit : entrée `cron.job` nommée `sync-schedule-daily`.

- [ ] **Step 1: Créer le fichier de migration**

Contenu de `supabase/migrations/20260628000000_schedule_sync_schedule_cron.sql` :
```sql
-- Sync quotidienne du calendrier de phase finale via l'edge function sync-schedule.
-- 08:00 heure de Paris = 06:00 UTC (CEST = UTC+2). Calqué sur sync-odds-daily.
select cron.schedule(
  'sync-schedule-daily',
  '0 6 * * *',
  $$
  select net.http_post(
    url := 'https://sazupuqxwrnvgzsdxkjg.supabase.co/functions/v1/sync-schedule',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);
```

- [ ] **Step 2: Appliquer la migration**

Via `mcp__plugin_supabase_supabase__apply_migration` :
- `project_id`: `sazupuqxwrnvgzsdxkjg`
- `name`: `schedule_sync_schedule_cron`
- `query`: le contenu SQL du Step 1.

Expected : succès, aucune erreur.

- [ ] **Step 3: Vérifier le job programmé**

Via `mcp__plugin_supabase_supabase__execute_sql` :
```sql
select jobname, schedule, active from cron.job where jobname = 'sync-schedule-daily';
```
Expected : une ligne `sync-schedule-daily`, `schedule='0 6 * * *'`, `active=true`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260628000000_schedule_sync_schedule_cron.sql
git commit -m "feat(prono): cron quotidien sync-schedule 08h00 Paris

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Libellé d'entête KO dérivé du `stage` (`TabMatchs.vue`)

**Files:**
- Modify: `src/components/tabs/TabMatchs.vue` (script + 2 emplacements template)

**Interfaces:**
- Consomme : `KO_STAGES` (déjà importé depuis `../../constants/ui` ligne 8), champ `Match.stage`.
- Produit : helper `koStageLabel(stage: string): string` utilisé par l'entête des cartes KO et par `matchStageLabel`.

- [ ] **Step 1: Ajouter le helper `koStageLabel` dans `<script setup>`**

Juste après la fonction `matchStageLabel` existante (vers ligne 186-188), ajouter :
```ts
function koStageLabel(stage: string): string {
  return KO_STAGES.find(s => s.id === stage)?.label ?? 'ÉLIMINATION'
}
```

- [ ] **Step 2: Utiliser le libellé dérivé dans `matchStageLabel` (mode Live)**

Remplacer la fonction existante :
```ts
function matchStageLabel(m: import('../../types').Match) {
  return m.stage === 'group' ? `GROUPE ${m.group}` : (m.round || 'ÉLIMINATION')
}
```
par :
```ts
function matchStageLabel(m: import('../../types').Match) {
  return m.stage === 'group' ? `GROUPE ${m.group}` : koStageLabel(m.stage)
}
```

- [ ] **Step 3: Utiliser le libellé dérivé dans l'entête des cartes KO**

Dans le bloc « KO header » (vers ligne 512), remplacer :
```html
<span class="anton" style="font-size: 11px; color: #f59e0b; letter-spacing: 1.5px">{{ m.round }}</span>
```
par :
```html
<span class="anton" style="font-size: 11px; color: #f59e0b; letter-spacing: 1.5px">{{ koStageLabel(m.stage) }}</span>
```

- [ ] **Step 4: Vérifier le typecheck + build**

Run:
```bash
npm run build
```
Expected : `vue-tsc` puis `vite build` se terminent sans erreur (exit 0).

- [ ] **Step 5: Commit**

```bash
git add src/components/tabs/TabMatchs.vue
git commit -m "feat(prono): entete KO derivee du stage (colonne round absente)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Vérification de bout en bout + nettoyage de la sonde

**Files:**
- Aucun fichier modifié (vérification + nettoyage d'infrastructure).

**Interfaces:**
- Consomme : tout ce qui précède.

- [ ] **Step 1: Vérifier l'affichage des R32 dans l'app (lecture seule)**

Lancer le dev server si besoin :
```bash
npm run dev
```
Dans l'onglet « Matchs » → bouton « 🏆 Élimination » → pill « 32èmes » : les 16 matchs R32 s'affichent avec équipes, drapeaux et champs de pronostic éditables (avant coup d'envoi). L'entête de chaque carte affiche « 32èmes ».

- [ ] **Step 2: Supprimer la fonction de sonde temporaire `probe-ko`**

```bash
supabase functions delete probe-ko --project-ref sazupuqxwrnvgzsdxkjg
```
(Si la CLI Supabase n'est pas disponible/authentifiée : le signaler à l'utilisateur pour suppression manuelle ; `probe-ko` est déjà neutralisée — renvoie 410.)

Vérifier ensuite via `mcp__plugin_supabase_supabase__list_edge_functions` que `probe-ko` n'apparaît plus (ou est la seule restante à supprimer).

- [ ] **Step 3: Vérification finale en base**

```sql
select stage, count(*) from matches group by stage order by stage;
```
Expected : `group=72`, `r32=16` (et davantage de stages au fil du tournoi). Aucune ligne `result_*` parasite issue des tests.

---

## Self-Review

**Couverture de la spec :**
- Réécriture `sync-schedule` source api-sports + mapping round→stage + upsert homogène + gestion équipes TBD → Task 1. ✓
- Idempotence (pas de touche aux résultats/pronostics/cotes) → Task 1 Step 5. ✓
- Cron quotidien 08:00 Paris → Task 2. ✓
- Libellé d'entête KO dérivé du stage (live + cartes KO) → Task 3. ✓
- Lancement immédiat pour les R32 → Task 1 Step 3. ✓
- Nettoyage `probe-ko` → Task 4 Step 2. ✓

**Placeholders :** aucun « TBD/TODO » ; tout le code est complet et inline.

**Cohérence des types/noms :** `koStageLabel(stage: string)` défini en Task 3 Step 1, réutilisé Steps 2-3. Codes de stage `r32/r16/qf/sf/3rd/final` cohérents entre l'edge function (Task 1) et `KO_STAGES`. Colonnes d'upsert homogènes et limitées aux champs calendrier.
