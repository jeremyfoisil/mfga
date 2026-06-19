# Radar joueur (toile d'araignée) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Afficher, en premier sous la photo du joueur, un radar à 6 axes composites (0–100) qui synthétise ses statistiques WC26.

**Architecture:** Une fonction pure `radarAxes(stats)` (`src/utils/playerRadar.ts`) calcule 6 scores 0–100 par moyenne de sous-métriques normalisées par 90 min contre des maxima de référence fixes. Un composant présentational `PlayerRadar.vue` dessine un SVG hexagonal fait main à partir de ces 6 axes. `TabJoueurs.vue` insère le radar dans la branche « stats », avant les sections détaillées.

**Tech Stack:** Vue 3 (`<script setup lang="ts">`), TypeScript, SVG inline. Aucune nouvelle dépendance.

## Global Constraints

- **Zéro nouvelle dépendance** : SVG fait main, pas de librairie de graphes.
- **Pas de comparaison aux pairs** : normalisation contre des maxima de référence fixes (constantes `REF`).
- **Par 90 minutes** pour les stats de volume (`stat / minutes * 90`) ; les taux (note, % précision, % duels) directement.
- **Sous-métriques `null` ignorées** dans la moyenne d'un axe ; un `0` réel compte. Axe sans aucune sous-métrique présente → `0`.
- **Pas de test runner** dans le repo. Vérification = sanity-check `npx tsx` de la fonction pure + `npm run build` (vue-tsc) + contrôle navigateur.
- Style : thème sombre, palette accent `#3b82f6`, grille `#1e293b`, police `system-ui` pour les labels (cohérent avec la fiche).
- Le radar ne fait **aucun appel réseau** : il dérive des `stats` déjà chargées.
- Ordre des axes (sens horaire depuis le haut) : Note, Attaque, Création, Défense, Duels, Temps de jeu.

---

## File Structure

- **Create** `src/utils/playerRadar.ts` — `radarAxes(stats): RadarAxis[]` (scoring pur) + types `RadarAxis`, `RadarStats` exportés.
- **Create** `src/components/ui/PlayerRadar.vue` — SVG hexagonal, prop `{ axes: RadarAxis[] }`.
- **Modify** `src/components/tabs/TabJoueurs.vue` — importer + insérer `<PlayerRadar :axes="radarAxes(data.stats)" />` avant les sections.

---

## Task 1: Fonction de scoring `playerRadar.ts`

**Files:**
- Create: `src/utils/playerRadar.ts`
- Temp (vérif, non commité): `scripts/_radar_check.ts`

**Interfaces:**
- Consumes: rien.
- Produces :
  - `export interface RadarAxis { label: string; value: number }`
  - `export interface RadarStats { minutes: number; rating: string | null; goals: number; assists: number; shotsTotal: number | null; passesTotal: number | null; passesAccuracy: number | null; passesKey: number | null; dribblesSuccess: number | null; tacklesTotal: number | null; interceptions: number | null; blocks: number | null; duelsTotal: number | null; duelsWon: number | null; appearances: number; lineups: number }`
  - `export function radarAxes(s: RadarStats): RadarAxis[]` → 6 entrées, `value` entier 0–100, dans l'ordre Note, Attaque, Création, Défense, Duels, Temps de jeu.

- [ ] **Step 1: Créer la fonction de scoring**

Create `src/utils/playerRadar.ts` :

```ts
// Scoring pur du radar joueur (toile d'araignée). Aucune dépendance Vue/runtime
// afin de pouvoir le raisonner et le vérifier isolément.

export interface RadarAxis { label: string; value: number }

// Le sous-ensemble des stats WC26 que le radar lit.
export interface RadarStats {
  minutes: number
  rating: string | null
  goals: number
  assists: number
  shotsTotal: number | null
  passesTotal: number | null
  passesAccuracy: number | null
  passesKey: number | null
  dribblesSuccess: number | null
  tacklesTotal: number | null
  interceptions: number | null
  blocks: number | null
  duelsTotal: number | null
  duelsWon: number | null
  appearances: number
  lineups: number
}

// Maxima de référence : la valeur qui vaut 100 sur chaque sous-métrique. Les
// stats de volume sont en par-90 ; les taux (note, précision, % duels) directs.
const REF = {
  goalsP90: 0.6, assistsP90: 0.4, shotsP90: 3.5,
  passesP90: 70, keyPassesP90: 2, dribblesP90: 2,
  tacklesP90: 3.5, interceptionsP90: 2, blocksP90: 1,
  duelsWonP90: 8, minutes: 270,
}

const clamp01 = (x: number) => Math.max(0, Math.min(1, x))

// Une sous-métrique vaut clamp01(value/ref), ou null (absente) si value est null.
type Sub = number | null
const sub = (value: number | null, ref: number): Sub =>
  value == null ? null : clamp01(value / ref)

// Moyenne des sous-métriques présentes, ramenée à 0..100 (0 si aucune présente).
function axisScore(subs: Sub[]): number {
  const present = subs.filter((s): s is number => s !== null)
  if (present.length === 0) return 0
  return Math.round((present.reduce((a, b) => a + b, 0) / present.length) * 100)
}

export function radarAxes(s: RadarStats): RadarAxis[] {
  // Par-90 : null (absent) quand la stat est null ou qu'aucune minute n'est jouée.
  const p90 = (value: number | null): number | null =>
    value == null || s.minutes === 0 ? null : (value / s.minutes) * 90

  const ratingNum = s.rating == null ? null : Number(s.rating)
  const rating = ratingNum != null && !Number.isNaN(ratingNum) ? ratingNum : null
  const winRate = s.duelsTotal && s.duelsTotal > 0 ? (s.duelsWon ?? 0) / s.duelsTotal : null
  const starter = s.appearances > 0 ? s.lineups / s.appearances : null

  return [
    { label: 'Note', value: axisScore([sub(rating, 10)]) },
    { label: 'Attaque', value: axisScore([
      sub(p90(s.goals), REF.goalsP90),
      sub(p90(s.assists), REF.assistsP90),
      sub(p90(s.shotsTotal), REF.shotsP90),
    ]) },
    { label: 'Création', value: axisScore([
      sub(p90(s.passesTotal), REF.passesP90),
      sub(s.passesAccuracy, 100),
      sub(p90(s.passesKey), REF.keyPassesP90),
      sub(p90(s.dribblesSuccess), REF.dribblesP90),
    ]) },
    { label: 'Défense', value: axisScore([
      sub(p90(s.tacklesTotal), REF.tacklesP90),
      sub(p90(s.interceptions), REF.interceptionsP90),
      sub(p90(s.blocks), REF.blocksP90),
    ]) },
    { label: 'Duels', value: axisScore([
      sub(p90(s.duelsWon), REF.duelsWonP90),
      sub(winRate, 1),
    ]) },
    { label: 'Temps de jeu', value: axisScore([
      sub(s.minutes, REF.minutes),
      sub(starter, 1),
    ]) },
  ]
}
```

- [ ] **Step 2: Écrire le script de sanity-check (temporaire)**

Create `scripts/_radar_check.ts` :

```ts
import { radarAxes } from '../src/utils/playerRadar'

// Exemple réel : A. Tchouaméni (1 match WC26, 90 min).
const axes = radarAxes({
  minutes: 90, rating: '7.3', goals: 0, assists: 0, shotsTotal: null,
  passesTotal: 69, passesAccuracy: 89, passesKey: null, dribblesSuccess: null,
  tacklesTotal: 3, interceptions: 2, blocks: null,
  duelsTotal: 7, duelsWon: 6, appearances: 1, lineups: 1,
})
console.log(axes.map(a => `${a.label}=${a.value}`).join(' '))
```

- [ ] **Step 3: Lancer le sanity-check et vérifier les valeurs**

Run: `npx --yes tsx scripts/_radar_check.ts`
Expected (sortie exacte) :
```
Note=73 Attaque=0 Création=94 Défense=93 Duels=80 Temps de jeu=67
```
Détail attendu : Note 7,3/10→73 ; Attaque (0 but, 0 passe déc., tirs null) →0 ; Création moyenne(69/70, 89/100)→94 ; Défense moyenne(3/3,5, 2/2)→93 ; Duels moyenne(6/8, 6/7)→80 ; Temps de jeu moyenne(90/270, 1/1)→67.

Si la sortie diffère, corriger `playerRadar.ts` (pas le test) jusqu'à correspondance.

- [ ] **Step 4: Vérifier qu'une saisie sans données ne plante pas**

Remplacer temporairement le corps de `scripts/_radar_check.ts` par un second cas (joueur 0 minute / tout null) et relancer :

```ts
import { radarAxes } from '../src/utils/playerRadar'
console.log(radarAxes({
  minutes: 0, rating: null, goals: 0, assists: 0, shotsTotal: null,
  passesTotal: null, passesAccuracy: null, passesKey: null, dribblesSuccess: null,
  tacklesTotal: null, interceptions: null, blocks: null,
  duelsTotal: null, duelsWon: null, appearances: 0, lineups: 0,
}).map(a => `${a.label}=${a.value}`).join(' '))
```

Run: `npx --yes tsx scripts/_radar_check.ts`
Expected :
```
Note=0 Attaque=0 Création=0 Défense=0 Duels=0 Temps de jeu=0
```
(Aucune exception ; tous les axes à 0.)

- [ ] **Step 5: Supprimer le script temporaire et committer le util seul**

```bash
rm scripts/_radar_check.ts
git add src/utils/playerRadar.ts
git commit -m "feat(players): add radarAxes scoring for the player spider chart"
```

(Ne pas committer `scripts/_radar_check.ts` ni un éventuel dossier `scripts/` vide.)

---

## Task 2: Composant `PlayerRadar.vue` + insertion dans la fiche

**Files:**
- Create: `src/components/ui/PlayerRadar.vue`
- Modify: `src/components/tabs/TabJoueurs.vue`

**Interfaces:**
- Consumes: `radarAxes` et `RadarAxis` de `src/utils/playerRadar.ts` (Task 1).
- Produces: composant `PlayerRadar` avec prop `{ axes: RadarAxis[] }`, affiché dans la fiche.

- [ ] **Step 1: Créer le composant SVG**

Create `src/components/ui/PlayerRadar.vue` :

```vue
<script setup lang="ts">
import { computed } from 'vue'
import type { RadarAxis } from '../../utils/playerRadar'

const props = defineProps<{ axes: RadarAxis[] }>()

const SIZE = 240
const MID = SIZE / 2   // centre
const R = 84           // rayon max
const N = 6            // nb d'axes

// vecteur unitaire de l'axe i (départ en haut, sens horaire)
function unit(i: number): { x: number; y: number } {
  const a = (-90 + i * (360 / N)) * Math.PI / 180
  return { x: Math.cos(a), y: Math.sin(a) }
}
function point(i: number, frac: number): { x: number; y: number } {
  const u = unit(i)
  return { x: MID + R * frac * u.x, y: MID + R * frac * u.y }
}
const toPoints = (pts: { x: number; y: number }[]) =>
  pts.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')

const norm = (v: number) => Math.max(0, Math.min(100, v)) / 100

const rings = [0.25, 0.5, 0.75, 1].map(f =>
  toPoints(Array.from({ length: N }, (_, i) => point(i, f))))

const spokes = Array.from({ length: N }, (_, i) => point(i, 1))

const polygon = computed(() =>
  toPoints(props.axes.map((a, i) => point(i, norm(a.value)))))

const vertices = computed(() =>
  props.axes.map((a, i) => ({ ...point(i, norm(a.value)) })))

const labels = computed(() => props.axes.map((a, i) => {
  const p = point(i, 1.2)
  const u = unit(i)
  const anchor = Math.abs(u.x) < 0.3 ? 'middle' : (u.x > 0 ? 'start' : 'end')
  return { x: p.x, y: p.y, anchor, label: a.label, value: a.value }
}))
</script>

<template>
  <svg :viewBox="`0 0 ${SIZE} ${SIZE}`" width="100%"
    style="max-width: 320px; display: block; margin: 0 auto; overflow: visible">
    <!-- anneaux de grille -->
    <polygon v-for="(r, i) in rings" :key="'r' + i" :points="r" fill="none" stroke="#1e293b" stroke-width="1" />
    <!-- rayons -->
    <line v-for="(s, i) in spokes" :key="'s' + i" :x1="MID" :y1="MID" :x2="s.x" :y2="s.y" stroke="#1e293b" stroke-width="1" />
    <!-- polygone du joueur -->
    <polygon :points="polygon" fill="#3b82f6" fill-opacity="0.25" stroke="#3b82f6" stroke-width="2" stroke-linejoin="round" />
    <!-- sommets -->
    <circle v-for="(v, i) in vertices" :key="'v' + i" :cx="v.x" :cy="v.y" r="2.5" fill="#3b82f6" />
    <!-- labels d'axes -->
    <text v-for="(l, i) in labels" :key="'l' + i" :x="l.x" :y="l.y" :text-anchor="l.anchor"
      dominant-baseline="middle" font-size="11" fill="#cbd5e1"
      style="font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif">
      {{ l.label }}<tspan font-size="10" fill="#64748b"> {{ l.value }}</tspan>
    </text>
  </svg>
</template>
```

- [ ] **Step 2: Importer dans `TabJoueurs.vue`**

Dans `src/components/tabs/TabJoueurs.vue`, après la ligne :
```ts
import PlayerSearch from '../ui/PlayerSearch.vue'
```
ajouter :
```ts
import PlayerRadar from '../ui/PlayerRadar.vue'
import { radarAxes } from '../../utils/playerRadar'
```

- [ ] **Step 3: Insérer le radar avant les sections**

Dans `src/components/tabs/TabJoueurs.vue`, repérer la branche « stats » :
```html
      <!-- stats -->
      <template v-else>
        <div v-for="sec in sections(data.stats)" :key="sec.label" :style="sCard">
```
La remplacer par (ajout de la carte radar avant la boucle) :
```html
      <!-- stats -->
      <template v-else>
        <!-- radar de synthèse -->
        <div :style="sCard">
          <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px">
            <span style="font-size: 16px">🕸️</span>
            <span style="font-family: Anton, sans-serif; font-size: 14px; color: #f8fafc; letter-spacing: 1px">PROFIL</span>
          </div>
          <PlayerRadar :axes="radarAxes(data.stats)" />
        </div>

        <div v-for="sec in sections(data.stats)" :key="sec.label" :style="sCard">
```

- [ ] **Step 4: Vérifier le build**

Run: `npm run build`
Expected : build réussit, aucune erreur de type. (`radarAxes(data.stats)` type-check : `PlayerStats['stats']` contient tous les champs de `RadarStats`.)

- [ ] **Step 5: Contrôle navigateur**

Run: `npm run dev`, se connecter, onglet **Joueurs**, chercher « Tchouam » → **A. Tchouaméni**.
Vérifier :
1. Un radar hexagonal s'affiche dans une carte « 🕸️ PROFIL », **entre** l'en-tête (photo/infos) et la première section « Temps de jeu ».
2. Les 6 axes sont étiquetés (Note, Attaque, Création, Défense, Duels, Temps de jeu) avec leur valeur ; la forme correspond aux scores attendus (Création/Défense hauts, Attaque ~0).
3. Sélectionner un autre joueur change la forme ; aucun nouvel appel réseau pour le radar (onglet Network — seul l'appel `player-stats-proxy` du changement de joueur).

- [ ] **Step 6: Commit**

```bash
git add src/components/ui/PlayerRadar.vue src/components/tabs/TabJoueurs.vue
git commit -m "feat(players): add spider chart synthesising player stats in the fiche"
```

---

## Self-Review

**Spec coverage :**
- Radar sous la photo, avant les sections → Task 2 Step 3.
- 6 axes composites 0–100, ordre Note/Attaque/Création/Défense/Duels/Temps de jeu → Task 1 `radarAxes`.
- Normalisation par-90 + maxima de référence fixes, moyenne des sous-métriques présentes (null ignorés) → Task 1 `p90`/`sub`/`axisScore`.
- SVG fait main, zéro dépendance → Task 2 `PlayerRadar.vue`.
- Cas limites (minutes 0 / rating null → axes à 0, pas d'exception) → Task 1 Step 4.
- `data === null` → pas de radar (le radar est dans la branche `v-else` « stats », jamais atteinte si `!data`) → Task 2 Step 3.
- Aucun appel réseau supplémentaire → le radar dérive de `data.stats` (Task 2 Step 5.3).
- Sanity-check Node de la fonction pure → Task 1 Steps 2–4.

**Placeholder scan :** aucun TODO/TBD ; tout le code (util, composant, diffs) est fourni intégralement, avec sortie attendue exacte.

**Type consistency :** `RadarAxis`/`RadarStats`/`radarAxes` définis en Task 1 et consommés tels quels en Task 2 (import de `radarAxes` + type `RadarAxis`). Le prop `{ axes: RadarAxis[] }` correspond à `radarAxes(...)` qui renvoie `RadarAxis[]`. Les libellés d'axes (`Note, Attaque, Création, Défense, Duels, Temps de jeu`) sont identiques entre la fonction et l'ordre attendu du sanity-check.
