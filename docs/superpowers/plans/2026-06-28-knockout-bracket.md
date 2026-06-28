# Bracket de phase finale (onglet Classement) — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajouter dans l'onglet Classement deux sous-onglets — « Élimination » (bracket miroir 32es→finale, seeding FIFA exact) et « Poules » (classements actuels inchangés).

**Architecture:** `TabClassement.vue` devient une coquille (toggle + un seul fetch `standings-proxy`, partagé). `GroupStandings.vue` (extrait) rend les poules. `KnockoutBracket.vue` (nouveau) rend le bracket à partir d'un modèle pur construit par `utils/bracket.ts`, qui place les matchs réels (`matchesStore`) dans la structure officielle WC2026 hardcodée (`constants/bracket.ts`) via résolution des graines (vainqueur/2e de poule) puis appariement par sous-arbre. Vitest est ajouté pour tester cette logique pure.

**Tech Stack:** Vue 3 + TypeScript (Vite), Pinia, Vitest (nouveau, dev-only).

## Global Constraints

- **Codes pays** : FIFA 3 lettres (ex. `Mexico→MEX`, `South Africa→RSA`, `Czech Republic→CZE`), clé = **nom anglais** de la base (mêmes noms que `matchesStore`). Repli : 3 premières lettres en majuscules.
- **Codes de stage en base** : `r32, r16, qf, sf, 3rd, final` (déjà existants).
- **Structure officielle WC2026** (numéros de match FIFA) — à hardcoder exactement :
  - 32es : 73 `2A/2B`, 74 `1E/3e`, 75 `1F/2C`, 76 `1C/2F`, 77 `1I/3e`, 78 `2E/2I`, 79 `1A/3e`, 80 `1L/3e`, 81 `1D/3e`, 82 `1G/3e`, 83 `2K/2L`, 84 `1H/2J`, 85 `1B/3e`, 86 `1J/2H`, 87 `1K/3e`, 88 `2D/2G`.
  - 8es : 89←73/75, 90←74/77, 91←76/78, 92←79/80, 93←83/84, 94←81/82, 95←86/88, 96←85/87.
  - Quarts : 97←89/90, 98←93/94, 99←91/92, 100←95/96. Demies : 101←97/98, 102←99/100. Finale 104←101/102. 3e place 103← perdants 101/102.
- **Vainqueur d'un match** = l'équipe qui réapparaît au tour suivant (gère les tirs au but). Champion/3e = vainqueur au score (pas de tour suivant).
- **Défaut du sous-onglet** : `Élimination`.
- **Noms d'équipes** : anglais partout (matchsStore `home_team`/`away_team`, et — à vérifier en Task 6 — les `team` de `standings-proxy`).
- **Pas de test runner avant ce plan** : la logique pure est testée avec Vitest (ajouté ici) ; les composants Vue sont vérifiés via `npm run build` (vue-tsc + vite) + contrôle visuel.

---

### Task 1: Codes pays FIFA — `TEAM_CODE`

**Files:**
- Modify: `src/constants/teams.ts` (ajout en fin de fichier)

**Interfaces:**
- Produces: `export const TEAM_CODE: Record<string, string>` (clé = nom anglais) et `export function teamCode(name: string): string`.

- [ ] **Step 1: Ajouter la map et le helper en fin de `src/constants/teams.ts`**

```ts
// Codes FIFA 3 lettres, clés sur les noms ANGLAIS (ceux de matchesStore).
export const TEAM_CODE: Record<string, string> = {
  'Mexico': 'MEX', 'South Africa': 'RSA', 'South Korea': 'KOR', 'Czech Republic': 'CZE',
  'Canada': 'CAN', 'Bosnia & Herzegovina': 'BIH', 'Qatar': 'QAT', 'Switzerland': 'SUI',
  'Brazil': 'BRA', 'Morocco': 'MAR', 'Haiti': 'HAI', 'Scotland': 'SCO',
  'USA': 'USA', 'Paraguay': 'PAR', 'Australia': 'AUS', 'Turkey': 'TUR',
  'Germany': 'GER', 'Curaçao': 'CUW', 'Ivory Coast': 'CIV', 'Ecuador': 'ECU',
  'Netherlands': 'NED', 'Japan': 'JPN', 'Sweden': 'SWE', 'Tunisia': 'TUN',
  'Belgium': 'BEL', 'Egypt': 'EGY', 'Iran': 'IRN', 'New Zealand': 'NZL',
  'Spain': 'ESP', 'Cape Verde': 'CPV', 'Saudi Arabia': 'KSA', 'Uruguay': 'URU',
  'France': 'FRA', 'Senegal': 'SEN', 'Iraq': 'IRQ', 'Norway': 'NOR',
  'Argentina': 'ARG', 'Algeria': 'ALG', 'Austria': 'AUT', 'Jordan': 'JOR',
  'Portugal': 'POR', 'DR Congo': 'COD', 'Uzbekistan': 'UZB', 'Colombia': 'COL',
  'England': 'ENG', 'Croatia': 'CRO', 'Ghana': 'GHA', 'Panama': 'PAN',
}

export function teamCode(name: string): string {
  return TEAM_CODE[name] ?? name.slice(0, 3).toUpperCase()
}
```

- [ ] **Step 2: Vérifier le typecheck/build**

Run: `npm run build`
Expected: exit 0 (vue-tsc + vite, sans erreur).

- [ ] **Step 3: Commit**

```bash
git add src/constants/teams.ts
git commit -m "feat(classement): codes FIFA 3 lettres (TEAM_CODE)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Structure officielle du tableau — `constants/bracket.ts`

**Files:**
- Create: `src/constants/bracket.ts`

**Interfaces:**
- Produces: types `Seed`, `R32Slot` ; constantes `R32_SLOTS`, `FEEDS`, `LEFT_COLUMNS`, `RIGHT_COLUMNS`, `FINAL_MATCH`, `THIRD_MATCH`, `STAGE_OF` ; fonction `roundLabel(match: number): string`.

- [ ] **Step 1: Créer `src/constants/bracket.ts`**

```ts
// Structure officielle du tableau à élimination directe de la Coupe du Monde 2026.
// Numéros de match FIFA (73..104). Source : tableau officiel FIFA / Wikipédia.

export type Seed =
  | { kind: 'win'; group: string }   // 1X — vainqueur du groupe X
  | { kind: 'run'; group: string }   // 2X — 2e du groupe X
  | { kind: 'third' }                // 3e — résolu via le match, pas par la graine

export interface R32Slot { match: number; a: Seed; b: Seed }

// 16 matchs de 32es, chacun avec ses deux graines. `a` est toujours résoluble
// (vainqueur/2e) : aucun match n'oppose deux 3es.
export const R32_SLOTS: R32Slot[] = [
  { match: 73, a: { kind: 'run', group: 'A' }, b: { kind: 'run', group: 'B' } },
  { match: 74, a: { kind: 'win', group: 'E' }, b: { kind: 'third' } },
  { match: 75, a: { kind: 'win', group: 'F' }, b: { kind: 'run', group: 'C' } },
  { match: 76, a: { kind: 'win', group: 'C' }, b: { kind: 'run', group: 'F' } },
  { match: 77, a: { kind: 'win', group: 'I' }, b: { kind: 'third' } },
  { match: 78, a: { kind: 'run', group: 'E' }, b: { kind: 'run', group: 'I' } },
  { match: 79, a: { kind: 'win', group: 'A' }, b: { kind: 'third' } },
  { match: 80, a: { kind: 'win', group: 'L' }, b: { kind: 'third' } },
  { match: 81, a: { kind: 'win', group: 'D' }, b: { kind: 'third' } },
  { match: 82, a: { kind: 'win', group: 'G' }, b: { kind: 'third' } },
  { match: 83, a: { kind: 'run', group: 'K' }, b: { kind: 'run', group: 'L' } },
  { match: 84, a: { kind: 'win', group: 'H' }, b: { kind: 'run', group: 'J' } },
  { match: 85, a: { kind: 'win', group: 'B' }, b: { kind: 'third' } },
  { match: 86, a: { kind: 'win', group: 'J' }, b: { kind: 'run', group: 'H' } },
  { match: 87, a: { kind: 'win', group: 'K' }, b: { kind: 'third' } },
  { match: 88, a: { kind: 'run', group: 'D' }, b: { kind: 'run', group: 'G' } },
]

// Match parent -> ses deux matchs enfants (les vainqueurs des enfants jouent le parent).
export const FEEDS: Record<number, [number, number]> = {
  89: [73, 75], 90: [74, 77], 91: [76, 78], 92: [79, 80],
  93: [83, 84], 94: [81, 82], 95: [86, 88], 96: [85, 87],
  97: [89, 90], 98: [93, 94], 99: [91, 92], 100: [95, 96],
  101: [97, 98], 102: [99, 100],
  104: [101, 102], // finale
  103: [101, 102], // 3e place (perdants des demies)
}

// Ordre vertical de rendu (extérieur -> centre), une sous-liste par colonne.
export const LEFT_COLUMNS: number[][] = [
  [73, 75, 74, 77, 83, 84, 81, 82], // 32es
  [89, 90, 93, 94],                 // 8es
  [97, 98],                         // quarts
  [101],                            // demie
]
export const RIGHT_COLUMNS: number[][] = [
  [102],                            // demie
  [99, 100],                        // quarts
  [91, 92, 95, 96],                 // 8es
  [76, 78, 79, 80, 86, 88, 85, 87], // 32es
]
export const FINAL_MATCH = 104
export const THIRD_MATCH = 103

// Stage (code base) d'un numéro de match.
export function STAGE_OF(match: number): 'r32' | 'r16' | 'qf' | 'sf' | 'final' | '3rd' {
  if (match === 104) return 'final'
  if (match === 103) return '3rd'
  if (match >= 101) return 'sf'
  if (match >= 97) return 'qf'
  if (match >= 89) return 'r16'
  return 'r32'
}

export function roundLabel(match: number): string {
  const s = STAGE_OF(match)
  return s === 'r32' ? '32es' : s === 'r16' ? '8es' : s === 'qf' ? 'Quarts'
    : s === 'sf' ? 'Demies' : s === '3rd' ? '3e place' : 'Finale'
}
```

- [ ] **Step 2: Vérifier le build**

Run: `npm run build`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add src/constants/bracket.ts
git commit -m "feat(classement): structure officielle du tableau WC2026

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Modèle de bracket (logique pure) + Vitest — `utils/bracket.ts`

**Files:**
- Create: `src/utils/bracket.ts`
- Create: `src/utils/bracket.test.ts`
- Modify: `package.json` (devDependency `vitest` + script `test`)

**Interfaces:**
- Consumes: `R32_SLOTS, FEEDS, FINAL_MATCH, THIRD_MATCH, STAGE_OF, roundLabel` (Task 2) ; le type `Match` (`src/types`).
- Produces:
  - `interface GroupRank { group: string; team: string; rank: number }`
  - `interface BracketTeam { name: string | null; won: boolean }`
  - `interface BracketCell { match: number; round: string; top: BracketTeam; bottom: BracketTeam; scoreTop: string; scoreBottom: string; live: boolean }`
  - `interface BracketModel { cells: Record<number, BracketCell>; champion: string | null }`
  - `export function buildBracket(matches: Match[], ranks: GroupRank[]): BracketModel`

- [ ] **Step 1: Ajouter Vitest**

Run:
```bash
npm install -D vitest
```
Expected: vitest ajouté à `devDependencies`.

Puis ajouter le script de test dans `package.json` (section `"scripts"`), à côté des scripts existants :

```json
    "test": "vitest run"
```

- [ ] **Step 2: Écrire le test (RED) — `src/utils/bracket.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { buildBracket, type GroupRank } from './bracket'
import type { Match } from '../types'

// Fabrique un Match minimal (seuls les champs lus par buildBracket comptent).
function m(id: number, stage: string, home: string, away: string, rh = '', ra = ''): Match {
  return {
    id, stage, group: null, home, away, homeKnown: true, awayKnown: true,
    homeLabel: '', awayLabel: '',
    result: { home: rh, away: ra, goalsHome: [], goalsAway: [], goalsHomeText: '', goalsAwayText: '', cardsHome: [], cardsAway: [] },
    matchDate: '', matchTime: '', venue: '', round: '', liveStatus: 'scheduled',
    liveMinute: null, liveExtra: null, oddsHome: null, oddsDraw: null, oddsAway: null,
  }
}

// Classement minimal : vainqueur/2e par groupe.
function ranks(pairs: [string, string, string][]): GroupRank[] {
  const out: GroupRank[] = []
  for (const [group, win, run] of pairs) {
    out.push({ group, team: win, rank: 1 }, { group, team: run, rank: 2 })
  }
  return out
}

describe('buildBracket', () => {
  // Groupes A..L : vainqueur = "<G>1", 2e = "<G>2". Thirds nommés "T<n>".
  const groups = ranks('ABCDEFGHIJKL'.split('').map(g => [g, g + '1', g + '2']) as [string, string, string][])

  it('place les 32es par graine d\'ancrage (vainqueur/2e), 3e via le match', () => {
    // Slot 79 = 1A vs 3e. Le match réel : A1 vs un 3e (T1).
    const matches = [m(1079, 'r32', 'A1', 'T1')]
    const model = buildBracket(matches, groups)
    const c = model.cells[79]
    expect(c).toBeDefined()
    expect(c.top.name).toBe('A1')      // 1A en haut
    expect(c.bottom.name).toBe('T1')   // 3e en bas
  })

  it('place un slot deux-graines et oriente top=a, bottom=b', () => {
    // Slot 73 = 2A vs 2B → A2 vs B2.
    const matches = [m(1073, 'r32', 'B2', 'A2')] // ordre store inversé
    const model = buildBracket(matches, groups)
    const c = model.cells[73]
    expect(c.top.name).toBe('A2')
    expect(c.bottom.name).toBe('B2')
  })

  it('mappe le score selon l\'orientation top/bottom', () => {
    // store: home=B2 away=A2, score 0-2 → top A2 doit lire 2, bottom B2 lit 0.
    const matches = [m(1073, 'r32', 'B2', 'A2', '0', '2')]
    const model = buildBracket(matches, groups)
    expect(model.cells[73].scoreTop).toBe('2')    // A2
    expect(model.cells[73].scoreBottom).toBe('0')  // B2
  })

  it('relie les 8es par sous-arbre et marque le vainqueur par progression', () => {
    // 89 ← 73(2A/2B: A2 vs B2) et 75(1F/2C: F1 vs C2). Vainqueurs A2 et F1 se rencontrent.
    const matches = [
      m(1073, 'r32', 'A2', 'B2', '1', '0'),
      m(1075, 'r32', 'F1', 'C2', '2', '1'),
      m(1089, 'r16', 'A2', 'F1', '', ''), // 8es 89
    ]
    const model = buildBracket(matches, groups)
    expect(model.cells[89]).toBeDefined()
    // A2 et F1 ont avancé (réapparaissent en 89)
    expect(model.cells[73].top.name).toBe('A2')
    expect(model.cells[73].top.won).toBe(true)   // A2 gagnant de 73
    expect(model.cells[75].top.name).toBe('F1')
    expect(model.cells[75].top.won).toBe(true)   // F1 gagnant de 75
    expect(model.cells[73].bottom.won).toBe(false)
  })

  it('gère les tirs au but : vainqueur = équipe qualifiée même si score nul', () => {
    const matches = [
      m(1073, 'r32', 'A2', 'B2', '1', '1'), // nul → tab
      m(1075, 'r32', 'F1', 'C2', '2', '1'),
      m(1089, 'r16', 'B2', 'F1'),           // B2 a passé les tab
    ]
    const model = buildBracket(matches, groups)
    expect(model.cells[73].bottom.name).toBe('B2')
    expect(model.cells[73].bottom.won).toBe(true)  // B2 qualifié malgré le nul
    expect(model.cells[73].top.won).toBe(false)
  })

  it('désigne le champion au score de la finale', () => {
    const matches = [m(1104, 'final', 'A1', 'B1', '3', '1')]
    const model = buildBracket(matches, groups)
    expect(model.champion).toBe('A1')
  })

  it('cellule absente si aucun match réel pour le slot', () => {
    const model = buildBracket([], groups)
    expect(model.cells[73]).toBeUndefined()
    expect(model.champion).toBeNull()
  })
})
```

- [ ] **Step 3: Lancer le test (échec attendu)**

Run: `npx vitest run src/utils/bracket.test.ts`
Expected: FAIL — `buildBracket` n'existe pas encore.

- [ ] **Step 4: Implémenter `src/utils/bracket.ts`**

```ts
import type { Match } from '../types'
import { R32_SLOTS, FEEDS, FINAL_MATCH, THIRD_MATCH, STAGE_OF, roundLabel, type Seed } from '../constants/bracket'

export interface GroupRank { group: string; team: string; rank: number }
export interface BracketTeam { name: string | null; won: boolean }
export interface BracketCell {
  match: number
  round: string
  top: BracketTeam
  bottom: BracketTeam
  scoreTop: string
  scoreBottom: string
  live: boolean
}
export interface BracketModel { cells: Record<number, BracketCell>; champion: string | null }

const ALL_MATCHES = [...R32_SLOTS.map(s => s.match), 89, 90, 91, 92, 93, 94, 95, 96, 97, 98, 99, 100, 101, 102, THIRD_MATCH, FINAL_MATCH]

function seedTeam(seed: Seed, bySeed: Map<string, string>): string | null {
  if (seed.kind === 'third') return null
  return bySeed.get((seed.kind === 'win' ? '1' : '2') + seed.group) ?? null
}

export function buildBracket(matches: Match[], ranks: GroupRank[]): BracketModel {
  // 1. graines vainqueur/2e -> équipe
  const bySeed = new Map<string, string>()
  for (const r of ranks) if (r.rank === 1 || r.rank === 2) bySeed.set(r.rank + r.group, r.team)

  // 2. matchs réels indexés par stage
  const byStage = new Map<string, Match[]>()
  for (const mt of matches) {
    if (!byStage.has(mt.stage)) byStage.set(mt.stage, [])
    byStage.get(mt.stage)!.push(mt)
  }

  // store -> { match number -> Match }, et { match number -> [team, team] }
  const slotMatch: Record<number, Match> = {}
  const slotTeams: Record<number, string[]> = {}

  const teamsOf = (mt: Match): string[] => [mt.home, mt.away]

  // 3. placer les 32es par graine d'ancrage (a est toujours résoluble)
  const r32 = byStage.get('r32') ?? []
  const usedR32 = new Set<number>()
  for (const slot of R32_SLOTS) {
    const anchor = seedTeam(slot.a, bySeed) // a toujours win/run
    if (!anchor) continue
    const mt = r32.find(x => !usedR32.has(x.id) && (x.home === anchor || x.away === anchor))
    if (!mt) continue
    usedR32.add(mt.id)
    slotMatch[slot.match] = mt
    slotTeams[slot.match] = teamsOf(mt)
  }

  // Repli : si aucune graine résolue, placer les 32es dans l'ordre des colonnes par id croissant.
  if (Object.keys(slotMatch).length === 0 && r32.length) {
    const order = [73, 75, 74, 77, 83, 84, 81, 82, 76, 78, 79, 80, 86, 88, 85, 87]
    const sorted = [...r32].sort((a, b) => a.id - b.id)
    order.forEach((mn, i) => { if (sorted[i]) { slotMatch[mn] = sorted[i]; slotTeams[mn] = teamsOf(sorted[i]) } })
  }

  // 4. sous-arbres : union des équipes sous chaque numéro de match (bottom-up)
  const subtree: Record<number, Set<string>> = {}
  const computeSubtree = (mn: number): Set<string> => {
    if (subtree[mn]) return subtree[mn]
    const s = new Set<string>()
    if (FEEDS[mn]) for (const c of FEEDS[mn]) for (const t of computeSubtree(c)) s.add(t)
    for (const t of (slotTeams[mn] ?? [])) s.add(t)
    subtree[mn] = s
    return s
  }
  ALL_MATCHES.forEach(computeSubtree)

  // 5. placer les rounds supérieurs : un match d'un stage va dans le slot du même
  //    stage dont le sous-arbre contient ses DEUX équipes.
  const upper: [string, number[]][] = [
    ['r16', [89, 90, 91, 92, 93, 94, 95, 96]],
    ['qf', [97, 98, 99, 100]],
    ['sf', [101, 102]],
    ['3rd', [THIRD_MATCH]],
    ['final', [FINAL_MATCH]],
  ]
  for (const [stage, slots] of upper) {
    const pool = byStage.get(stage) ?? []
    const used = new Set<number>()
    for (const mn of slots) {
      const sub = subtree[mn]
      const mt = pool.find(x => !used.has(x.id) && sub.has(x.home) && sub.has(x.away))
      if (!mt) continue
      used.add(mt.id)
      slotMatch[mn] = mt
      slotTeams[mn] = teamsOf(mt)
    }
  }

  // 6. construire les cellules + orientation top/bottom + score + live
  const cells: Record<number, BracketCell> = {}
  for (const mn of ALL_MATCHES) {
    const mt = slotMatch[mn]
    if (!mt) continue
    // Orientation : pour les 32es, top = équipe de la graine `a` si connue ; sinon home.
    let topName = mt.home
    const slot = R32_SLOTS.find(s => s.match === mn)
    if (slot) {
      const aTeam = seedTeam(slot.a, bySeed)
      if (aTeam && (mt.home === aTeam || mt.away === aTeam)) topName = aTeam
    }
    const botName = mt.home === topName ? mt.away : mt.home
    const scoreTop = mt.home === topName ? mt.result.home : mt.result.away
    const scoreBottom = mt.home === topName ? mt.result.away : mt.result.home
    cells[mn] = {
      match: mn, round: roundLabel(mn),
      top: { name: topName, won: false },
      bottom: { name: botName, won: false },
      scoreTop, scoreBottom,
      live: mt.liveStatus === 'live',
    }
  }

  // 7. vainqueurs par progression : l'équipe d'un enfant qui figure dans le match parent a gagné.
  for (const parentStr of Object.keys(FEEDS)) {
    const parent = Number(parentStr)
    if (parent === THIRD_MATCH) continue // 3e place : pas un "tour suivant"
    const parentTeams = slotTeams[parent]
    if (!parentTeams) continue
    for (const child of FEEDS[parent]) {
      const cc = cells[child]
      if (!cc) continue
      if (cc.top.name && parentTeams.includes(cc.top.name)) cc.top.won = true
      if (cc.bottom.name && parentTeams.includes(cc.bottom.name)) cc.bottom.won = true
    }
  }

  // 8. champion = vainqueur au score de la finale (pas de tour suivant)
  let champion: string | null = null
  const f = cells[FINAL_MATCH]
  if (f && f.scoreTop !== '' && f.scoreBottom !== '') {
    const a = parseInt(f.scoreTop), b = parseInt(f.scoreBottom)
    if (a > b) { champion = f.top.name; f.top.won = true }
    else if (b > a) { champion = f.bottom.name; f.bottom.won = true }
  }

  return { cells, champion }
}
```

- [ ] **Step 5: Lancer le test (GREEN)**

Run: `npx vitest run src/utils/bracket.test.ts`
Expected: PASS — 7/7.

- [ ] **Step 6: Vérifier le build complet**

Run: `npm run build`
Expected: exit 0 (le fichier de test n'est pas inclus dans le build vite).

- [ ] **Step 7: Commit**

```bash
git add src/utils/bracket.ts src/utils/bracket.test.ts package.json package-lock.json
git commit -m "feat(classement): modèle de bracket (seeding + progression) + tests vitest

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Extraire les poules — `GroupStandings.vue`

**Files:**
- Create: `src/components/ui/GroupStandings.vue`

**Interfaces:**
- Consumes: type `GroupStanding` (défini inline ici, identique à l'actuel).
- Produces: composant `<GroupStandings :groups="groups" :loading="loading" :error="error" />`.

- [ ] **Step 1: Créer `src/components/ui/GroupStandings.vue`** (markup repris à l'identique de l'actuel `TabClassement.vue`, données reçues en props)

```vue
<script setup lang="ts">
import { C } from '../../constants/ui'
import { getFlag } from '../../utils/ui'

interface StandingRow { rank: number; team: string; played: number; win: number; draw: number; lose: number; diff: number; points: number }
interface GroupStanding { group: string; rows: StandingRow[] }

defineProps<{ groups: GroupStanding[]; loading: boolean; error: string | null }>()

function fmtDiff(d: number): string { return d > 0 ? '+' + d : String(d) }
</script>

<template>
  <div v-if="loading" style="display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 60px 0; gap: 14px">
    <div class="res-spinner"></div>
    <div style="font-size: 12px; color: #64748b; letter-spacing: 1px; font-family: Anton, sans-serif">CHARGEMENT…</div>
  </div>

  <div v-else-if="error" style="text-align: center; padding: 40px; color: #ef4444; font-size: 13px">{{ error }}</div>

  <div v-else-if="groups.length === 0" :style="{ background: C.card, border: '1px solid ' + C.border, borderRadius: '12px', padding: '40px 20px', textAlign: 'center', marginTop: '10px' }">
    <div style="font-size: 13px; font-family: Anton, sans-serif; letter-spacing: 1px; color: #fbbf24">CLASSEMENTS PAS ENCORE DISPONIBLES</div>
    <div style="font-size: 11px; color: #475569; margin-top: 6px">Ils apparaîtront une fois les matchs de poule joués.</div>
  </div>

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
.res-spinner { width: 32px; height: 32px; border: 3px solid #1e293b; border-top-color: #22c55e; border-radius: 50%; animation: spin 0.8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg) } }
</style>
```

- [ ] **Step 2: Vérifier le build**

Run: `npm run build`
Expected: exit 0 (composant non encore référencé — c'est normal, le build passe).

- [ ] **Step 3: Commit**

```bash
git add src/components/ui/GroupStandings.vue
git commit -m "refactor(classement): extrait l'affichage des poules dans GroupStandings.vue

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: Le bracket — `KnockoutBracket.vue`

**Files:**
- Create: `src/components/ui/KnockoutBracket.vue`

**Interfaces:**
- Consumes: `buildBracket`, types `GroupRank`/`BracketCell` (Task 3) ; `LEFT_COLUMNS, RIGHT_COLUMNS, FINAL_MATCH, THIRD_MATCH, roundLabel` (Task 2) ; `useMatchesStore` ; `getFlag`, `teamCode`.
- Produces: composant `<KnockoutBracket :ranks="ranks" />` (prop `ranks: GroupRank[]`).

- [ ] **Step 1: Créer `src/components/ui/KnockoutBracket.vue`**

```vue
<script setup lang="ts">
import { computed } from 'vue'
import { useMatchesStore } from '../../stores/matches'
import { buildBracket, type GroupRank } from '../../utils/bracket'
import { LEFT_COLUMNS, RIGHT_COLUMNS, FINAL_MATCH, THIRD_MATCH, roundLabel } from '../../constants/bracket'
import { getFlag } from '../../utils/ui'
import { teamCode } from '../../constants/teams'

const props = defineProps<{ ranks: GroupRank[] }>()
const matchesStore = useMatchesStore()

const model = computed(() => buildBracket(matchesStore.matches, props.ranks))

// Y a-t-il au moins un match KO en base ?
const hasKO = computed(() => matchesStore.matches.some(m => m.stage !== 'group'))

// Label de tour pour l'en-tête d'une colonne (à partir de son premier match).
function colLabel(col: number[]): string { return roundLabel(col[0]) }
</script>

<template>
  <div v-if="!hasKO" :style="{ background: '#111827', border: '1px solid #1e293b', borderRadius: '12px', padding: '40px 20px', textAlign: 'center', marginTop: '10px' }">
    <div style="font-size: 13px; font-family: Anton, sans-serif; letter-spacing: 1px; color: #f59e0b">TABLEAU PAS ENCORE DISPONIBLE</div>
    <div style="font-size: 11px; color: #475569; margin-top: 6px">Il se remplira dès le début de la phase finale.</div>
  </div>

  <div v-else class="bracket-scroll">
    <div class="bracket">
      <!-- Moitié gauche : colonnes extérieur -> centre -->
      <div v-for="(col, ci) in LEFT_COLUMNS" :key="'L' + ci" class="bcol">
        <div class="bcol-label">{{ colLabel(col) }}</div>
        <div class="bcol-cells">
          <div v-for="mn in col" :key="mn" class="bcell">
            <template v-if="model.cells[mn]">
              <div class="brow" :class="{ won: model.cells[mn].top.won }">
                <span class="bflag">{{ model.cells[mn].top.name ? getFlag(model.cells[mn].top.name!) : '⬜' }}</span>
                <span class="bcode">{{ model.cells[mn].top.name ? teamCode(model.cells[mn].top.name!) : '—' }}</span>
                <span class="bscore">{{ model.cells[mn].scoreTop }}</span>
              </div>
              <div class="brow" :class="{ won: model.cells[mn].bottom.won }">
                <span class="bflag">{{ model.cells[mn].bottom.name ? getFlag(model.cells[mn].bottom.name!) : '⬜' }}</span>
                <span class="bcode">{{ model.cells[mn].bottom.name ? teamCode(model.cells[mn].bottom.name!) : '—' }}</span>
                <span class="bscore">{{ model.cells[mn].scoreBottom }}</span>
              </div>
              <span v-if="model.cells[mn].live" class="blive"></span>
            </template>
            <div v-else class="bcell-empty">à définir</div>
          </div>
        </div>
      </div>

      <!-- Centre : finale + 3e place -->
      <div class="bcol bcol-final">
        <div class="bcol-label">Finale</div>
        <div class="bcol-cells">
          <div class="bcell bcell-trophy">
            <div class="btrophy">🏆</div>
            <div v-if="model.cells[FINAL_MATCH]" class="bcell">
              <div class="brow" :class="{ won: model.cells[FINAL_MATCH].top.won }">
                <span class="bflag">{{ model.cells[FINAL_MATCH].top.name ? getFlag(model.cells[FINAL_MATCH].top.name!) : '⬜' }}</span>
                <span class="bcode">{{ model.cells[FINAL_MATCH].top.name ? teamCode(model.cells[FINAL_MATCH].top.name!) : '—' }}</span>
                <span class="bscore">{{ model.cells[FINAL_MATCH].scoreTop }}</span>
              </div>
              <div class="brow" :class="{ won: model.cells[FINAL_MATCH].bottom.won }">
                <span class="bflag">{{ model.cells[FINAL_MATCH].bottom.name ? getFlag(model.cells[FINAL_MATCH].bottom.name!) : '⬜' }}</span>
                <span class="bcode">{{ model.cells[FINAL_MATCH].bottom.name ? teamCode(model.cells[FINAL_MATCH].bottom.name!) : '—' }}</span>
                <span class="bscore">{{ model.cells[FINAL_MATCH].scoreBottom }}</span>
              </div>
            </div>
            <div v-else class="bcell-empty">Finale</div>
            <div v-if="model.champion" class="bchamp">🏆 {{ teamCode(model.champion) }}</div>
            <div class="bthird">
              <div class="bcol-label">3e place</div>
              <div v-if="model.cells[THIRD_MATCH]" class="bcell">
                <div class="brow"><span class="bflag">{{ model.cells[THIRD_MATCH].top.name ? getFlag(model.cells[THIRD_MATCH].top.name!) : '⬜' }}</span><span class="bcode">{{ model.cells[THIRD_MATCH].top.name ? teamCode(model.cells[THIRD_MATCH].top.name!) : '—' }}</span><span class="bscore">{{ model.cells[THIRD_MATCH].scoreTop }}</span></div>
                <div class="brow"><span class="bflag">{{ model.cells[THIRD_MATCH].bottom.name ? getFlag(model.cells[THIRD_MATCH].bottom.name!) : '⬜' }}</span><span class="bcode">{{ model.cells[THIRD_MATCH].bottom.name ? teamCode(model.cells[THIRD_MATCH].bottom.name!) : '—' }}</span><span class="bscore">{{ model.cells[THIRD_MATCH].scoreBottom }}</span></div>
              </div>
              <div v-else class="bcell-empty">à définir</div>
            </div>
          </div>
        </div>
      </div>

      <!-- Moitié droite : colonnes centre -> extérieur -->
      <div v-for="(col, ci) in RIGHT_COLUMNS" :key="'R' + ci" class="bcol">
        <div class="bcol-label">{{ colLabel(col) }}</div>
        <div class="bcol-cells">
          <div v-for="mn in col" :key="mn" class="bcell">
            <template v-if="model.cells[mn]">
              <div class="brow" :class="{ won: model.cells[mn].top.won }">
                <span class="bflag">{{ model.cells[mn].top.name ? getFlag(model.cells[mn].top.name!) : '⬜' }}</span>
                <span class="bcode">{{ model.cells[mn].top.name ? teamCode(model.cells[mn].top.name!) : '—' }}</span>
                <span class="bscore">{{ model.cells[mn].scoreTop }}</span>
              </div>
              <div class="brow" :class="{ won: model.cells[mn].bottom.won }">
                <span class="bflag">{{ model.cells[mn].bottom.name ? getFlag(model.cells[mn].bottom.name!) : '⬜' }}</span>
                <span class="bcode">{{ model.cells[mn].bottom.name ? teamCode(model.cells[mn].bottom.name!) : '—' }}</span>
                <span class="bscore">{{ model.cells[mn].scoreBottom }}</span>
              </div>
              <span v-if="model.cells[mn].live" class="blive"></span>
            </template>
            <div v-else class="bcell-empty">à définir</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.bracket-scroll { overflow-x: auto; -webkit-overflow-scrolling: touch; padding: 12px 0; margin-top: 8px; }
.bracket { display: flex; align-items: stretch; gap: 6px; min-width: max-content; }
.bcol { display: flex; flex-direction: column; min-width: 78px; }
.bcol-label { font-family: Anton, sans-serif; font-size: 9px; letter-spacing: 1px; color: #f59e0b; text-align: center; margin-bottom: 6px; text-transform: uppercase; }
.bcol-cells { display: flex; flex-direction: column; justify-content: space-around; flex: 1; gap: 6px; }
.bcell { position: relative; background: #0f172a; border: 1px solid #1e293b; border-radius: 6px; padding: 3px 4px; }
.bcell-empty { display: flex; align-items: center; justify-content: center; min-height: 38px; background: #0b1220; border: 1px dashed #1e293b; border-radius: 6px; color: #475569; font-size: 9px; font-style: italic; }
.brow { display: flex; align-items: center; gap: 4px; padding: 1px 0; }
.brow.won .bcode { color: #fbbf24; font-weight: 800; }
.brow.won .bscore { color: #fbbf24; }
.brow:not(.won) { opacity: 0.72; }
.bflag { font-size: 13px; line-height: 1; }
.bcode { flex: 1; font-size: 10px; font-weight: 700; color: #e2e8f0; letter-spacing: 0.5px; }
.bscore { font-size: 11px; font-family: Anton, sans-serif; color: #94a3b8; min-width: 9px; text-align: right; }
.blive { position: absolute; top: 3px; right: 3px; width: 6px; height: 6px; border-radius: 50%; background: #ef4444; animation: pulse 1s infinite; }
@keyframes pulse { 50% { opacity: 0.3 } }
.bcol-final { min-width: 92px; justify-content: center; }
.bcell-trophy { display: flex; flex-direction: column; align-items: stretch; gap: 6px; background: transparent; border: none; padding: 0; }
.btrophy { font-size: 26px; text-align: center; }
.bchamp { text-align: center; font-family: Anton, sans-serif; font-size: 12px; color: #fbbf24; letter-spacing: 1px; }
.bthird { margin-top: 10px; }
</style>
```

- [ ] **Step 2: Vérifier le build**

Run: `npm run build`
Expected: exit 0 (composant non encore référencé).

- [ ] **Step 3: Commit**

```bash
git add src/components/ui/KnockoutBracket.vue
git commit -m "feat(classement): composant bracket miroir KnockoutBracket.vue

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: Coquille + sous-onglets — `TabClassement.vue`

**Files:**
- Modify: `src/components/tabs/TabClassement.vue` (réécriture)

**Interfaces:**
- Consumes: `GroupStandings.vue` (Task 4), `KnockoutBracket.vue` (Task 5), type `GroupRank` (Task 3).

- [ ] **Step 1: Réécrire `src/components/tabs/TabClassement.vue`**

```vue
<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { sb } from '../../supabase'
import GroupStandings from '../ui/GroupStandings.vue'
import KnockoutBracket from '../ui/KnockoutBracket.vue'
import type { GroupRank } from '../../utils/bracket'

interface StandingRow { rank: number; team: string; played: number; win: number; draw: number; lose: number; diff: number; points: number }
interface GroupStanding { group: string; rows: StandingRow[] }

const view = ref<'elim' | 'poules'>('elim')
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

// Graines (vainqueur/2e par groupe) pour le seeding du bracket.
const ranks = computed<GroupRank[]>(() =>
  groups.value.flatMap(g => g.rows
    .filter(r => r.rank === 1 || r.rank === 2)
    .map(r => ({ group: g.group, team: r.team, rank: r.rank })))
)
</script>

<template>
  <div>
    <!-- Toggle sous-onglets -->
    <div style="display: flex; gap: 6px; margin-bottom: 12px; background: #0f172a; border-radius: 10px; padding: 4px">
      <button
        :style="{ flex: 1, padding: '8px', borderRadius: '8px', border: 'none', cursor: 'pointer', fontFamily: 'Anton, sans-serif', fontSize: '12px', letterSpacing: '1px', textTransform: 'uppercase', background: view === 'elim' ? 'linear-gradient(135deg, #f59e0b, #b45309)' : 'transparent', color: view === 'elim' ? '#0a0e1a' : '#64748b', boxShadow: view === 'elim' ? '0 2px 0 #451a03' : 'none' }"
        @click="view = 'elim'">🏆 Élimination</button>
      <button
        :style="{ flex: 1, padding: '8px', borderRadius: '8px', border: 'none', cursor: 'pointer', fontFamily: 'Anton, sans-serif', fontSize: '12px', letterSpacing: '1px', textTransform: 'uppercase', background: view === 'poules' ? 'linear-gradient(135deg, #dc2626, #991b1b)' : 'transparent', color: view === 'poules' ? '#fff' : '#64748b', boxShadow: view === 'poules' ? '0 2px 0 #1e3a8a' : 'none' }"
        @click="view = 'poules'">⚽ Poules</button>
    </div>

    <KnockoutBracket v-if="view === 'elim'" :ranks="ranks" />
    <GroupStandings v-else :groups="groups" :loading="loading" :error="error" />
  </div>
</template>
```

- [ ] **Step 2: Vérifier le build**

Run: `npm run build`
Expected: exit 0.

- [ ] **Step 3: Vérification visuelle + cohérence des noms (dev server)**

Run: `npm run dev` puis ouvrir l'app → onglet « Classement ».
Vérifier :
- Deux sous-onglets ; **Élimination** affiché par défaut ; **Poules** identique à avant.
- Le bracket montre les 16 matchs de 32es dans la disposition miroir, finale + 🏆 au centre, 3e place sous la finale, codes 3 lettres + drapeaux.
- **Cohérence des noms (point d'intégration clé)** : si les cellules de 32es affichent « à définir » alors que les matchs existent, c'est que les noms d'équipes de `standings-proxy` diffèrent de ceux de `matchesStore` (le seeding échoue). Confirmer en comparant, dans la console, `groups` (noms `team`) et `matchesStore.matches` (`home`/`away`). S'ils diffèrent (ex. français vs anglais), reporter en DONE_WITH_CONCERNS — un mapping de normalisation devra être ajouté dans `buildBracket` (hors périmètre de code de cette tâche, à remonter).
- Placement attendu (exemple concret, données réelles au 28/06) : le match contenant le **vainqueur du groupe A** doit occuper le slot 79 (32es, moitié gauche) ; le match contenant le **2e A** et le **2e B** doit occuper le slot 73.

- [ ] **Step 4: Commit**

```bash
git add src/components/tabs/TabClassement.vue
git commit -m "feat(classement): sous-onglets Élimination (bracket) / Poules

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review

**Couverture de la spec :**
- Sous-onglets Élimination (défaut) / Poules → Task 6. ✓
- GroupStandings inchangé extrait → Task 4. ✓
- Structure officielle WC2026 hardcodée → Task 2. ✓
- Codes FIFA 3 lettres → Task 1. ✓
- Modèle bracket : seeding par ancre, mapping par sous-arbre, progression, tirs au but, champion, repli → Task 3 (+ tests). ✓
- Rendu miroir, badges+codes, vainqueur surligné, 3e place, trophée centre, scroll horizontal mobile → Task 5. ✓
- « à définir » pour slots non déterminés → Tasks 5/3. ✓
- Réactivité matchesStore/groups → Task 5 (computed). ✓

**Placeholders :** aucun « TBD/TODO » ; code complet partout. La vérif visuelle (Task 6) inclut un contrôle explicite de cohérence des noms (risque d'intégration identifié, avec marche à suivre).

**Cohérence des types/noms :** `GroupRank`, `BracketCell`, `BracketModel`, `buildBracket(matches, ranks)` définis en Task 3 et consommés en Tasks 5/6 avec les mêmes signatures. `teamCode` (Task 1) et `roundLabel/LEFT_COLUMNS/RIGHT_COLUMNS/FINAL_MATCH/THIRD_MATCH/STAGE_OF` (Task 2) utilisés en Tasks 3/5. Codes de stage `r32..final` cohérents avec `STAGE_OF`.

## Risque identifié — VÉRIFIÉ OK avant exécution

Le seeding suppose que les noms d'équipes de `standings-proxy` (`team`) sont identiques à ceux de `matchesStore` (`home`/`away`). **Vérifié le 28/06 en appelant `standings-proxy`** : il renvoie des noms **anglais identiques** au store (ex. « Mexico », « Czech Republic », « Bosnia & Herzegovina »). Aucun mapping de normalisation nécessaire. La vérification visuelle de Task 6 reste un garde-fou.
