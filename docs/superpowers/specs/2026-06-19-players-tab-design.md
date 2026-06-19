# Onglet « JOUEURS » — Design

**Date :** 2026-06-19
**Statut :** validé

## Objectif

Nouvel onglet permettant, depuis un champ de recherche branché sur la table
`players`, de sélectionner un joueur et d'afficher ses statistiques Coupe du
Monde 2026 récupérées depuis API-Football. La clé API reste **côté serveur**
(edge function proxy), conformément au pattern de l'app.

## Contexte / faits établis

- Table `players` : `id, name, team, position, goals, assists, yellow, red, api_id`.
  Les **1248 joueurs ont tous un `api_id`** (= id joueur API-Football, écrit par
  `seed-players` à partir de `/players/squads`). On appelle donc l'API par id,
  sans matching par nom.
- Pattern d'appel API : edge function proxy (clé serveur, CORS, helper `json`,
  handler OPTIONS) → `sb.functions.invoke('<proxy>', { body })`. Réfs :
  `stats-proxy`, `match-stats-proxy`, `squad-proxy`, `standings-proxy`.
- Onglets : tableau `TABS` dans `src/constants/ui.ts`, rendu conditionnel
  `app.tab === N` dans `App.vue`, le header (`AppHeader.vue`) mappe déjà sur
  `TABS`. Indices actuels 0→4. `app.tab` est remis à 0 au logout.
- `PlayerSearch.vue` fait déjà l'autocomplete sur `players` mais n'émet que le
  nom (`@update`). Utilisé par `TabBonus.vue` → toute évolution doit être
  non-cassante.
- Périmètre stats retenu : **WC26 uniquement** (`league=1`, `season=2026`).
- Niveau de détail retenu : **détaillé par catégories**.
- Position de l'onglet : **fin de barre, index 5**.

## Architecture

```
TabJoueurs.vue
  └─ PlayerSearch.vue   (@select → { name, team, api_id })
  └─ invoke('player-stats-proxy', { apiId })
        └─ edge function → GET /players?id={apiId}&league=1&season=2026
        └─ renvoie { data: { profile, stats } | null }
```

### 1. Edge function `player-stats-proxy`

Fichier : `supabase/functions/player-stats-proxy/index.ts`. Calquée sur
`stats-proxy` (CORS, `APISPORTS_KEY` via env avec fallback, `API_HOST`,
`LEAGUE = 1`, `SEASON = 2026`, helper `json`, handler OPTIONS).

- **Entrée** : corps JSON `{ apiId: number }`. Si absent/invalide → `400`.
- **Appel** : `GET /players?id={apiId}&league=1&season=2026`.
- **Normalisation** : prend `response[0]`. Le `player` donne le profil ; on
  sélectionne dans `statistics` l'entrée dont `league.id === 1` (sinon, si une
  seule entrée existe, on la prend ; sinon `data: null`).
- **Sortie** `{ data: PlayerStats | null }` avec :
  - `profile` : `{ name, photo, age, nationality, height, weight, injured }`.
  - `stats` regroupé en catégories (valeurs `null` de l'API → `0` ou `'—'`) :
    - **Temps de jeu** : `appearances` (games.appearences), `lineups`,
      `minutes`, `position` (games.position), `rating` (games.rating, gardé tel
      quel, peut être `null`).
    - **Attaque** : `shotsTotal`, `shotsOn`, `goals` (goals.total),
      `assists` (goals.assists).
    - **Construction** : `passesTotal`, `passesKey`, `passesAccuracy`,
      `dribblesAttempts`, `dribblesSuccess`.
    - **Défense** : `tacklesTotal`, `interceptions` (tackles.interceptions),
      `blocks` (tackles.blocks), `duelsTotal`, `duelsWon`.
    - **Discipline** : `foulsDrawn`, `foulsCommitted`, `yellow` (cards.yellow),
      `red` (cards.red + cards.yellowred).
    - **Penalties** : `penWon`, `penScored`, `penMissed`.
  - `data: null` quand l'API ne renvoie aucune stat WC26 exploitable (joueur
    pas encore entré en jeu).
- Erreur réseau / réponse non-`ok` → `json({ data: null })` (pas d'exception
  côté client ; le composant affiche l'état « pas de données »). Une vraie
  erreur 5xx interne reste possible mais le chemin nominal ne jette pas.

### 2. `PlayerSearch.vue` — extension non-cassante

- Étendre l'interface `PlayerRow` et le `select` Supabase à `name, team, api_id`.
- Ajouter un émit `(e: 'select', player: { name: string; team: string; api_id: number }): void`
  déclenché dans `select(p)`, **en plus** de `@update`.
- `@update` (nom seul) et toute la signature actuelle restent inchangés →
  `TabBonus.vue` non impacté.

### 3. `TabJoueurs.vue` (nouveau)

Fichier : `src/components/tabs/TabJoueurs.vue`.

- En haut : `<PlayerSearch @select="onSelect" />` (placeholder « Rechercher un
  joueur… »).
- État local : `selected` (joueur courant), `loading`, `error`, `data`
  (`PlayerStats | null`), et un cache `Map<number, PlayerStats | null>` par
  `api_id`.
- `onSelect(player)` : si `api_id` déjà en cache → réutilise ; sinon
  `loading = true` puis `sb.functions.invoke('player-stats-proxy', { body: { apiId } })`,
  stocke le résultat dans le cache.
- Rendu selon l'état :
  - **idle** (aucun joueur sélectionné) : carte d'invite.
  - **loading** : indicateur.
  - **error** : message d'erreur réseau + équipe/nom du joueur sélectionné.
  - **no-data** (`data === null`) : carte « Pas encore de statistiques sur
    cette Coupe du Monde » avec en-tête joueur (nom, équipe, drapeau).
  - **fiche** : carte en-tête (photo API si dispo, drapeau équipe via
    `getFlag`, âge/poste/nationalité) + une carte `sCard` par catégorie, chaque
    stat en ligne libellé → valeur.
- Style : réutilise `sCard`, `C` (couleurs), police Anton pour les titres,
  `getFlag` (`utils/ui`) — cohérent avec `TabStats.vue`.

### 4. Câblage de l'onglet

- `src/constants/ui.ts` : `TABS` → ajouter `"Joueurs"` en dernier (index 5).
- `src/App.vue` : importer `TabJoueurs`, ajouter
  `<TabJoueurs v-else-if="app.tab === 5" />` après `TabStats`.
- `AppHeader.vue` : aucun changement (boucle sur `TABS`).

## Déploiement

- Déployer l'edge function : `npx supabase functions deploy player-stats-proxy --project-ref sazupuqxwrnvgzsdxkjg`.
- Build front : `npm run build` (vue-tsc + vite).

## Hors périmètre (YAGNI)

- Pas de comparaison multi-joueurs.
- Pas de mise en cache en base (cache mémoire de session uniquement).
- Pas de stats club / saisons antérieures / carrière.
- Aucune modification des colonnes `players.goals/assists/yellow/red`.
- Pas de réindexation des onglets existants (ajout en fin de barre).

## Critères de réussite

1. Recherche d'un joueur → sélection → ses stats WC26 s'affichent par catégories.
2. Joueur sans stat WC26 → état « pas encore de statistiques » lisible.
3. Re-sélection d'un joueur déjà consulté → pas de nouvel appel réseau.
4. La clé API n'apparaît jamais côté client.
5. `TabBonus` (recherche de joueur pour les bonus) fonctionne toujours.
6. `npm run build` passe (types OK).
