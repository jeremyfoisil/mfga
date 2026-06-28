# Bracket de phase finale dans l'onglet Classement

Date : 2026-06-28
Statut : conception validée

## Contexte & objectif

L'onglet « Classement » (`app.tab === 3` → `TabClassement.vue`) affiche aujourd'hui
uniquement les **classements de poules** (équipes par groupe, via l'edge function
`standings-proxy`). La phase à élimination directe est désormais en cours et ses
matchs sont en base (`stage ∈ {r32,r16,qf,sf,3rd,final}`, voir spec
`2026-06-28-ko-phase-pronostics-design.md`).

On ajoute **deux sous-onglets** dans l'onglet Classement :

1. **« Élimination »** (défaut) — un **bracket miroir** des 32es à la finale,
   façon « tableau du tournoi » (réf. visuelle : bracket FIFA officiel, deux
   moitiés convergeant vers la finale + trophée au centre, badges ronds drapeau
   + code 3 lettres).
2. **« Poules »** — l'affichage actuel des classements de groupes, **déplacé tel
   quel**, sans changement fonctionnel.

Le bracket affiche le **tableau réel du tournoi** (équipes qui avancent + scores),
avec **seeding FIFA exact** (placement officiel des matchs dans l'arbre).

## Architecture

```
TabClassement.vue            (coquille : toggle + fetch standings + dispatch)
├── GroupStandings.vue       (sous-onglet « Poules » — extrait, inchangé)
└── KnockoutBracket.vue      (sous-onglet « Élimination » — nouveau)
        └─ utils/bracket.ts  (modèle de bracket : seeds → matchs → slots)
        └─ constants/bracket.ts (structure officielle WC2026)
        └─ constants/teams.ts   (+ TEAM_CODE : codes 3 lettres FIFA)
```

- `TabClassement.vue` devient une **coquille** : état `view: 'elim' | 'poules'`
  (défaut `'elim'`), barre de 2 pills (style identique au toggle de stage de
  `TabMatchs.vue`). Elle fait **une seule fois** le fetch `standings-proxy`
  (déplacé depuis l'actuel) et passe les classements (`groups`) aux **deux**
  enfants — `GroupStandings` pour l'affichage, `KnockoutBracket` pour la
  résolution des graines.
- `GroupStandings.vue` reçoit `groups` en prop et reprend **à l'identique** le
  markup actuel des tableaux de poules (loading/error/empty/groupes). Aucun
  changement de logique ni de style.
- `KnockoutBracket.vue` reçoit `groups` en prop, lit `useMatchesStore().matches`
  (aucun fetch propre), construit le modèle via `utils/bracket.ts` et le rend.

## Données

### Structure officielle du tableau (hardcodée) — `constants/bracket.ts`

Arbre fixe WC2026 (numéros de match officiels) :

- **32es (73–88)** — chaque slot = paire de graines :
  73 `2A`/`2B` · 74 `1E`/`3e` · 75 `1F`/`2C` · 76 `1C`/`2F` · 77 `1I`/`3e` ·
  78 `2E`/`2I` · 79 `1A`/`3e` · 80 `1L`/`3e` · 81 `1D`/`3e` · 82 `1G`/`3e` ·
  83 `2K`/`2L` · 84 `1H`/`2J` · 85 `1B`/`3e` · 86 `1J`/`2H` · 87 `1K`/`3e` ·
  88 `2D`/`2G`
- **8es (89–96)** : 89←73/75 · 90←74/77 · 91←76/78 · 92←79/80 · 93←83/84 ·
  94←81/82 · 95←86/88 · 96←85/87
- **Quarts (97–100)** : 97←89/90 · 98←93/94 · 99←91/92 · 100←95/96
- **Demies (101–102)** : 101←97/98 · 102←99/100
- **Finale** 104←101/102 · **3e place** 103← perdants 101/102

Ordre vertical pour le rendu miroir (extérieur → centre) :

- **Moitié gauche** (vers SF 101) — 32es de haut en bas : `73,75,74,77,83,84,81,82`
  → 8es `89,90,93,94` → quarts `97,98` → demie `101`.
- **Finale** `104` au centre (+ `103` 3e place).
- **Moitié droite** (vers SF 102) — demie `102` → quarts `99,100` →
  8es `91,92,95,96` → 32es de haut en bas : `76,78,79,80,86,88,85,87`.

Représentation : une liste ordonnée de slots par round et par moitié, chaque
slot 32es portant ses deux **graines** (`{type:'win'|'run'|'third', group?}`),
et chaque slot de round supérieur portant ses deux slots-enfants. La forme exacte
de la structure de données est libre côté implémentation, tant qu'elle exprime
l'arbre ci-dessus et l'ordre vertical par moitié.

### Codes 3 lettres — `TEAM_CODE` dans `constants/teams.ts`

Map `nom anglais (base) → code FIFA 3 lettres` pour les 48 équipes
(ex. `Mexico→MEX`, `South Africa→RSA`, `Czech Republic→CZE`). Repli : 3 premières
lettres en majuscules si une équipe manque (robustesse).

### Résolution des graines → équipes

À partir des classements (`groups: GroupStanding[]`, chaque `StandingRow` porte
`rank` et `team`) :
- `1X` = `team` de `rank===1` du groupe X ; `2X` = `team` de `rank===2`.
- Les **3es** ne sont pas résolus par graine : inutile (voir mapping ci-dessous).

### Mapping matchs réels → slots (cœur du seeding exact)

1. **32es** : pour chaque slot, sa **graine d'ancrage** est son côté vainqueur ou
   2e (tout slot en a au moins un — voir Invariants). On résout l'ancre en équipe,
   puis on cherche le match `r32` de `matchesStore` qui **contient** cette équipe
   (côté home ou away) → ce match occupe ce slot. L'autre équipe du match (le 3e
   ou l'autre W/R) se place automatiquement. Aucune table des 3es nécessaire.
2. **Rounds supérieurs (8es → finale)** : reliés par **progression**. Le(s)
   vainqueur(s) d'un slot enfant (équipe ayant avancé) réapparaî(ssen)t dans un
   match du round suivant ; on rattache ce match au slot parent en cherchant le
   match du round dont une équipe figure parmi les vainqueurs des deux enfants.
3. **« Qui a gagné »** : un match est considéré gagné par l'équipe qui **réapparaît
   au tour suivant** (gère les tirs au but, où le score FT est nul). Le **champion**
   = vainqueur de la finale (par score ; si finale jouée). Tant qu'un round suivant
   n'existe pas / qu'un match n'est pas joué, pas de vainqueur affiché.
4. **Repli** : si les classements sont indisponibles (fetch standings échoué), on
   place les 32es dans l'ordre de `matchesStore` (best-effort) sans garantie de
   conformité — le bracket reste affichable.

### Invariants (validés sur la structure WC2026)

- Composition 32es : 4 matchs `1er v 2e`, 8 matchs `1er v 3e`, 4 matchs `2e v 2e`
  → **aucun match 3e-v-3e** → tout slot 32es a ≥1 graine vainqueur/2e résoluble.
- Chaque graine `1X`/`2X` (24 au total) apparaît dans exactement un match de 32es
  → le mapping par ancre est sans ambiguïté.

## Rendu (`KnockoutBracket.vue`)

- **Layout miroir** : deux moitiés (gauche s'écoule vers la droite, droite vers la
  gauche), **Finale + 🏆 au centre**, **3e place** en petit près de la finale.
  Colonnes de l'extérieur vers le centre : 32es → 8es → quarts → demies → finale.
  Labels de tour dans les inter-colonnes. Connecteurs en CSS (branches reliant
  chaque slot à ses deux enfants — exacts puisque l'arbre est hardcodé).
- **Cellule de match** : deux **badges ronds drapeau** (`getFlag`, qui gère déjà
  les noms anglais) + **code 3 lettres** ; score final à côté ; **vainqueur
  surligné** (accent or/vert), perdant atténué. Match `live` → point rouge.
  Slot non encore déterminé → « à définir » (badge neutre).
- **Largeur mobile** : badges compacts ; si l'arbre déborde la largeur, conteneur
  en **défilement horizontal centré sur la finale** à l'ouverture. Pas de
  refonte du système d'onglets principal.
- Données réactives : recalcul auto quand `matchesStore.matches` ou `groups`
  changent (realtime déjà en place sur `matches`).

## Hors périmètre (YAGNI)

- Pas de pronostics dans le bracket (tableau réel uniquement).
- Pas de modification de `standings-proxy` ni du schéma.
- Pas d'arbre interactif (clic → détail) en v1.
- Pas de table de combinaison des 3es (évitée par le mapping par ancre).

## Critères de réussite

- Onglet Classement : 2 sous-onglets, « Élimination » par défaut, « Poules »
  identique à l'actuel.
- Bracket miroir conforme à la structure FIFA : les 16 matchs de 32es sont placés
  dans leur slot officiel ; les 8es/quarts/demies/finale se remplissent par
  progression ; vainqueurs surlignés ; champion 🏆 après la finale.
- Robuste aux tirs au but (vainqueur = équipe qualifiée au tour suivant).
- Repli gracieux si classements indisponibles.

## Sources

- [2026 FIFA World Cup knockout stage — Wikipedia](https://en.wikipedia.org/wiki/2026_FIFA_World_Cup_knockout_stage)
- [2026 FIFA World Cup Bracket — CBS Sports](https://www.cbssports.com/soccer/news/2026-fifa-world-cup-bracket-knockout-stage/)
