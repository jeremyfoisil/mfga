# Radar joueur (toile d'araignée) — Design

**Date :** 2026-06-19
**Statut :** validé

## Objectif

Ajouter, dans la fiche de l'onglet JOUEURS, un graphique radar (toile
d'araignée) affiché **en premier sous la carte en-tête**, au-dessus des 6
sections détaillées, pour synthétiser en un coup d'œil toutes les statistiques
WC26 du joueur sélectionné.

## Contexte / faits établis

- La fiche joueur (`src/components/tabs/TabJoueurs.vue`) reçoit
  `data: PlayerStats | null` de l'edge function `player-stats-proxy`. Le bloc
  `stats` contient : `appearances, lineups, minutes, position, rating,
  shotsTotal, shotsOn, goals, assists, passesTotal, passesKey, passesAccuracy,
  dribblesAttempts, dribblesSuccess, tacklesTotal, interceptions, blocks,
  duelsTotal, duelsWon, foulsDrawn, foulsCommitted, yellow, red, penWon,
  penScored, penMissed`. Les champs de volume creux (tirs, passes clés,
  dribbles, fautes…) sont souvent `null` en début de tournoi ; `goals`,
  `assists`, `yellow`, `red` valent `0` (pas `null`).
- L'app n'a **aucune librairie de graphes** (deps : vue, pinia,
  supabase-js). Ajouter chart.js pour un seul radar serait disproportionné →
  **SVG fait main**.
- Pas de test runner (`package.json` = `dev`/`build`/`preview`). Vérification =
  sanity-check Node de la fonction pure + `npm run build` + contrôle navigateur.
- Style : thème sombre, palette `C` (`src/constants/ui.ts`), police lisible
  `system-ui` (cohérente avec les lignes de stats et l'en-tête déjà en place).

## Contraintes de normalisation (décidées)

- **Pas de comparaison aux pairs.** Un percentile « vs tous les joueurs du
  Mondial » serait idéal mais l'API ne fournit pas les stats complètes de tous
  les joueurs en un appel (1248 joueurs → irréaliste). Chaque axe est donc
  normalisé contre un **maximum de référence fixe**, calibré « niveau Coupe du
  Monde » et ajustable.
- **Robustesse au faible volume de matchs.** Les stats de volume sont ramenées
  **par 90 minutes** (`stat / minutes * 90`) → le radar reflète un *taux* de
  contribution, pas un cumul. Les taux (note, % de précision, % de duels
  gagnés) sont pris directement.
- **Données creuses.** Chaque axe = **moyenne des sous-métriques disponibles**
  (les `null` sont ignorés ; un `0` réel compte). Chaque sous-métrique est
  bornée à `[0, 1]` (= ref atteinte), la moyenne ×100 donne le score 0–100.

## Les 6 axes

Ordre (sens horaire depuis le sommet) : Note, Attaque, Création, Défense,
Duels, Temps de jeu. `p90` = valeur par 90 min ; `null` ignoré.

| Axe | Sous-métriques → score 100 à la référence |
|---|---|
| **Note** | `rating / 10` (rating est une chaîne ; `Number(rating)`. `null` → sous-métrique absente) |
| **Attaque** | `goalsP90 / 0.6` · `assistsP90 / 0.4` · `shotsTotalP90 / 3.5` |
| **Création** | `passesTotalP90 / 70` · `passesAccuracy / 100` · `passesKeyP90 / 2` · `dribblesSuccessP90 / 2` |
| **Défense** | `tacklesTotalP90 / 3.5` · `interceptionsP90 / 2` · `blocksP90 / 1` |
| **Duels** | `duelsWonP90 / 8` · `duelsWon / duelsTotal` (si `duelsTotal > 0`) |
| **Temps de jeu** | `minutes / 270` · `lineups / appearances` (si `appearances > 0`) |

Notes :
- `goals`, `assists` ne sont jamais `null` (valent `0`) → ils comptent toujours
  dans Attaque (un milieu sans but a bien une Attaque basse).
- `Note` et `Temps de jeu` ne sont **pas** par-90 (ce sont déjà un taux et un
  indicateur de volume — `Temps de jeu` est l'axe qui capte le volume, en
  complément des axes de taux).
- Maxima de référence (constantes nommées, regroupées en tête de fichier) :
  `REF = { goalsP90: 0.6, assistsP90: 0.4, shotsP90: 3.5, passesP90: 70,
  keyPassesP90: 2, dribblesP90: 2, tacklesP90: 3.5, interceptionsP90: 2,
  blocksP90: 1, duelsWonP90: 8, minutes: 270 }`.

### Calcul d'un axe (règle commune)

```
clamp01(x) = max(0, min(1, x))
sub(value, ref) = value == null ? ABSENT : clamp01(value / ref)
p90(value) = (value == null || minutes == 0) ? null : value / minutes * 90
axisScore(subs[]) = subs sans ABSENT ; si vide → 0 ; sinon round(mean(subs) * 100)
```

## Architecture / fichiers

- **Create `src/utils/playerRadar.ts`** — fonction pure
  `radarAxes(stats: RadarStats): RadarAxis[]` où
  `interface RadarAxis { label: string; value: number }` (6 entrées, `value`
  entier 0–100, dans l'ordre ci-dessus). Contient `REF`, `clamp01`, `p90`,
  `sub`, `axisScore`. Aucune dépendance Vue → testable isolément.
  - **Typage de l'entrée :** le util **exporte** son propre type structurel
    `RadarStats` (les champs du bloc `stats` qu'il lit :
    `minutes, rating, goals, assists, shotsTotal, passesTotal, passesAccuracy,
    passesKey, dribblesSuccess, tacklesTotal, interceptions, blocks, duelsTotal,
    duelsWon, appearances, lineups`, avec leurs nullabilités). Pour rester à une
    seule source de vérité, `TabJoueurs.vue` fait de son interface
    `PlayerStats['stats']` un alias compatible (ou réutilise `RadarStats`) — pas
    de duplication divergente. `radarAxes` n'a pas besoin des champs non lus
    (`shotsOn, dribblesAttempts, position, foulsDrawn, foulsCommitted, yellow,
    red, penWon, penScored, penMissed`).
- **Create `src/components/ui/PlayerRadar.vue`** — présentational. Props :
  `{ axes: RadarAxis[] }`. Dessine un SVG hexagonal :
  - viewBox carré (ex. `0 0 240 240`), centre `(120, 120)`, rayon max `~84`.
  - Anneaux de grille à 25/50/75/100 (hexagones concentriques, trait
    `C.border`), 6 spokes du centre aux sommets.
  - Polygone du joueur : sommets à `rayon * value/100` sur chaque axe, rempli
    en `C.accent` translucide (`fill-opacity ~0.25`), contour `C.accent`, petits
    points aux sommets.
  - Labels d'axes autour (police `system-ui` ~11px, `#cbd5e1`) + la valeur
    (ex. `72`) près de chaque sommet (~10px, `#94a3b8`).
  - `RadarAxis` est réexporté/typé depuis `playerRadar.ts` (source de vérité).
- **Modify `src/components/tabs/TabJoueurs.vue`** — importer `PlayerRadar` et
  `radarAxes` ; insérer `<PlayerRadar :axes="radarAxes(data.stats)" />` dans la
  branche « stats » (`v-else` du `template`), **juste après** la carte en-tête
  et **avant** la boucle `sections`. Enveloppé dans une carte `sCard` avec un
  petit titre Anton (ex. « PROFIL »).

## Cas limites

- `data === null` (pas de stats WC) → la carte « Pas encore de statistiques »
  s'affiche, **pas de radar** (inchangé).
- `minutes === 0` ou `rating === null` → les sous-métriques concernées sont
  absentes/0 ; le radar se resserre vers le centre (honnête). Si **les 6 axes
  valent 0**, `PlayerRadar` affiche quand même la grille vide (cas très rare,
  pas de traitement spécial).
- Poste : **un seul jeu d'axes pour tous les postes** (choix retenu). Un gardien
  aura Attaque/Création/Duels bas — assumé pour la v1.

## Hors périmètre (YAGNI)

- Pas d'axes spécifiques au poste.
- Pas de comparaison à un autre joueur / à une moyenne.
- Pas de librairie de graphes.
- Pas d'animation (un simple rendu statique suffit ; une transition CSS légère
  reste permise mais non requise).

## Critères de réussite

1. La fiche d'un joueur ayant des stats WC26 montre un radar à 6 axes sous la
   photo, au-dessus des sections.
2. `radarAxes` renvoie 6 valeurs entières 0–100 ; sanity-check sur l'exemple
   Tchouaméni (rating 7.3, 90 min, 69 passes/89 %, 3 tacles, 2 interceptions,
   7 duels/6 gagnés, 0 but/0 passe déc., tirs/dribbles/passes clés `null`) →
   Note ≈ 73, Création et Duels élevés, Attaque basse, valeurs cohérentes.
3. Les axes à sous-métriques toutes `null` n'écrasent pas le score (ignorées).
4. `npm run build` passe.
5. Aucun appel réseau supplémentaire (le radar dérive des stats déjà chargées).
