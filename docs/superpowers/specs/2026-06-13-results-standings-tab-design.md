# Design — Onglet « Résultats » (classements de groupes)

Date : 2026-06-13

## Contexte

L'onglet n°4 de l'app (`TABS` dans `src/constants/ui.ts`, label `"Tableau"`, composant
`src/components/tabs/TabTableau.vue`, affiché par `App.vue` quand `app.tab === 4`) ne contient
aujourd'hui qu'une **image statique** du tableau de la phase finale (`/assets/tableau.png`).

On le remplace par un onglet **« Résultats »** affichant les **classements de groupes** de la
Coupe du Monde 2026 (points, matchs gagnés/nuls/perdus, goal average), alimentés par l'endpoint
API-Football `standings`.

### Décisions de cadrage prises au brainstorming

1. **Le bracket de phase finale est supprimé** entièrement. L'onglet devient uniquement les
   classements de groupes. L'asset `tableau.png` n'est plus référencé (laissé en place, suppression optionnelle).
2. **Source** : endpoint `standings?league=1&season=2026` (clé API côté serveur, via un proxy).
3. **Colonnes** : Rang · Équipe · J · G · N · P · Diff · Pts. La « goal average » = différence de buts.
4. **Surlignage** : les 2 premiers de chaque groupe (qualifiés) sont discrètement mis en évidence.

## Architecture

- **Edge function `standings-proxy`** — récupère et normalise les classements.
- **`TabResultats.vue`** — remplace `TabTableau.vue` ; fetch + rendu des tables par groupe.
- **Câblage** — `TABS` label + import/usage dans `App.vue`.

## Edge function `standings-proxy`

Nouvelle fonction Supabase, calquée sur `match-stats-proxy` / `stats-proxy` (mêmes CORS, même
clé `APISPORTS_KEY`, même `TEAM_ALIAS`/`norm`, même `apiFetch`, même helper `json`, OPTIONS).

- **Entrée** : aucune (POST sans body requis ; le body éventuel est ignoré).
- **Traitement** :
  - Appelle `standings?league=1&season=2026`.
  - Si la réponse n'est pas OK ou est vide → `{ data: [] }`.
  - Lit `response[0].league.standings` : un tableau **par groupe**, chaque groupe étant un tableau
    de lignes d'équipe.
  - Pour chaque groupe, dérive la lettre depuis `row.group` (`"Group A"` → `"A"` ; on retire le
    préfixe `"Group "`, fallback = la chaîne brute). Construit les lignes normalisées.
- **Sortie** : `{ data: GroupStanding[] }` avec
  - `GroupStanding = { group: string; rows: StandingRow[] }`
  - `StandingRow = { rank: number; team: string; played: number; win: number; draw: number; lose: number; diff: number; points: number }`
  - `team = norm(entry.team.name)` (pour que `getFlag` du front retrouve le drapeau).
  - `played = entry.all.played`, `win = entry.all.win`, `draw = entry.all.draw`,
    `lose = entry.all.lose`, `diff = entry.goalsDiff`, `points = entry.points`,
    `rank = entry.rank`.
  - Groupes dans l'ordre renvoyé par l'API (déjà A, B, …).

## `TabResultats.vue`

Remplace `TabTableau.vue` (nouveau fichier `src/components/tabs/TabResultats.vue` ; l'ancien est supprimé).

- **Fetch au montage** : `sb.functions.invoke('standings-proxy')`. Le composant est monté/démonté
  à chaque changement d'onglet (`App.vue` utilise `v-else-if`), donc les données sont fraîches à
  chaque ouverture — pas de cache à gérer.
- **États** :
  - chargement → spinner (même style que les autres onglets) ;
  - erreur → message rouge ;
  - vide (`data: []`) → « Classements pas encore disponibles » ;
  - données → une section par groupe.
- **Rendu par groupe** :
  - en-tête « GROUPE A » (police Anton, accent jaune `#fbbf24` comme les autres titres d'onglet) ;
  - une table, colonnes dans l'ordre : **Rang · Équipe · J · G · N · P · Diff · Pts** ;
    - Équipe = `getFlag(team)` + nom (`team`) ;
    - Diff affiché signé (`+3`, `0`, `-2`) ;
    - Pts en gras / police Anton ;
    - en-tête de colonnes en petit gris.
  - **Qualifiés** : les lignes `rank <= 2` ont un fond/indicateur discret (ex. bordure ou fond
    légèrement vert) pour marquer la qualification.

## Câblage

- `src/constants/ui.ts` : dans `TABS`, remplacer `"Tableau"` par `"Résultats"` (même position, index 4).
- `src/App.vue` : remplacer `import TabTableau from './components/tabs/TabTableau.vue'` par
  `import TabResultats from './components/tabs/TabResultats.vue'`, et l'usage
  `<TabTableau v-else-if="app.tab === 4" />` par `<TabResultats v-else-if="app.tab === 4" />`.
- Supprimer `src/components/tabs/TabTableau.vue`.

## États / erreurs

| État        | Condition                          | Rendu                                         |
|-------------|------------------------------------|-----------------------------------------------|
| Chargement  | appel en cours                     | spinner                                       |
| Vide        | `data: []` (classements absents)   | « Classements pas encore disponibles »        |
| Erreur      | appel échoué                       | message d'erreur rouge                        |
| Données     | `data.length > 0`                  | une table de classement par groupe            |

## Tests / vérification

- Type-check : `npx vue-tsc --noEmit`.
- Déploiement de l'edge function `standings-proxy` (Supabase) + smoke-test (curl avec clé anon).
- Vérif manuelle navigateur : onglet « Résultats » affiche les groupes ; colonnes correctes ;
  diff signée ; 2 premiers surlignés ; état vide si les classements ne sont pas encore publiés.

## Hors périmètre (YAGNI)

- Tableau de la phase finale / bracket (supprimé).
- Classement live calculé localement (on utilise l'endpoint standings).
- Détail des règles de départage, confrontations directes, meilleurs troisièmes.
- BP / BC séparés (seule la différence est affichée).
