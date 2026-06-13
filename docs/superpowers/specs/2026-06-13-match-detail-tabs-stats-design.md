# Design — Onglets dans la modale match (Compositions + Statistiques)

Date : 2026-06-13

## Contexte

La modale ouverte depuis un match (`LineupModal.vue`, ouverte par `openLineup` dans
`TabMatchs.vue`) affiche aujourd'hui un terrain custom (compositions officielles ou liste
du groupe en fallback, avec badges buts/cartons, timings de remplacement, hover photo/âge).

On veut faire évoluer cette modale en y ajoutant une navigation par onglets :
- onglet **Compositions** (par défaut) → le terrain custom existant, inchangé ;
- onglet **Statistiques** → nouvelles stats d'équipe du match (domicile vs extérieur).

### Décisions de cadrage prises au brainstorming

1. **Pas de widget API-Sports.** Le widget officiel exige la clé API en clair côté client
   (`data-key`), ce qui exposerait la clé aujourd'hui protégée par les edge functions. On
   construit donc un onglet stats custom, alimenté par un proxy serveur, dans le style de l'app.
2. **Source des stats** : endpoint dédié `fixtures/statistics?fixture=<id>` d'API-Football.
3. **`matches.id` EST l'id de fixture API-Football.** Confirmé par `squad-proxy` qui appelle
   déjà `fixtures/lineups?fixture=${matchId}`. Aucune résolution de fixture nécessaire.
4. **Set de stats** : essentiel curé + xG.

## Architecture des composants

- **`LineupModal.vue` → coquille à onglets.** Conserve le header (drapeaux / noms / formations /
  bouton fermer). Ajoute sous le header une **barre d'onglets** (`Compositions` | `Statistiques`),
  `Compositions` actif par défaut. Le corps bascule selon l'onglet actif (état local `ref`).
  - Tout le rendu terrain actuel (pitch SVG, joueurs, remplaçants, squad fallback, hover) est
    **inchangé** ; il est simplement conditionné à l'onglet `Compositions` actif.
  - L'état loading/error existant concerne le fetch des compositions (`squad-proxy`) et reste
    rattaché à l'onglet Compositions.
- **`MatchStats.vue` → nouveau composant** (corps de l'onglet Statistiques).
  - Props : `matchId: number`, `homeName: string`, `awayName: string`.
  - Gère son **propre** cycle fetch / loading / error / vide.
  - Rend les barres comparatives.

Cette extraction évite de gonfler `LineupModal.vue` (déjà ~420 lignes) : le terrain et les
stats restent deux unités à responsabilité unique.

## Edge function `match-stats-proxy`

Nouvelle fonction Supabase, calquée sur `stats-proxy` / `squad-proxy`.

- **Entrée** : `POST { matchId: number }`.
- **Traitement** :
  - Appelle `fixtures/statistics?fixture=<matchId>` avec `x-apisports-key` (clé serveur,
    `APISPORTS_KEY` env, jamais exposée).
  - L'API renvoie un tableau de 2 entrées `{ team: {id, name}, statistics: [{type, value}] }`.
  - **Orientation domicile/extérieur** par nom d'équipe : réutilise `TEAM_ALIAS` / `norm` et la
    logique de flip de `squad-proxy` (l'API peut inverser home/away vs notre DB). Si une seule
    ou aucune entrée, renvoyer `data: []`.
  - Filtre/normalise au set curé et renvoie une ligne par stat.
- **Sortie** : `{ data: StatLine[] }` avec
  `StatLine = { key: string; label: string; home: number; away: number; kind: 'percent' | 'number' }`.
  - `home`/`away` sont numériques (possession `"55%"` → `55` ; valeurs nulles → `0`).
  - `kind: 'percent'` pour possession ; `'number'` sinon. xG affiché tel quel (décimal).

### Set de stats (ordre d'affichage)

| key            | label (FR)      | type API-Football      | kind    |
|----------------|-----------------|------------------------|---------|
| possession     | Possession      | Ball Possession        | percent |
| shots_total    | Tirs            | Total Shots            | number  |
| shots_on       | Tirs cadrés     | Shots on Goal          | number  |
| corners        | Corners         | Corner Kicks           | number  |
| fouls          | Fautes          | Fouls                  | number  |
| offsides       | Hors-jeu        | Offsides               | number  |
| yellow         | Cartons jaunes  | Yellow Cards           | number  |
| red            | Cartons rouges  | Red Cards              | number  |
| xg             | xG              | expected_goals         | number  |

- **xG** : omis de la sortie s'il est absent ou nul des deux côtés pour ce match.
- Une stat absente de la réponse pour les deux équipes est omise ; absente d'un seul côté → `0`.

## Flux de données (front)

1. Clic sur un match → `openLineup` (inchangé) : ouvre la modale, onglet actif = `Compositions`,
   fetch `squad-proxy` comme aujourd'hui.
2. Clic sur l'onglet `Statistiques` :
   - **Premier clic uniquement** : `MatchStats` appelle `sb.functions.invoke('match-stats-proxy', { body: { matchId } })`,
     stocke le résultat (succès ou erreur) pour la durée de vie de la modale.
   - Re-clic : aucun nouvel appel (cache local au composant).
3. Fermer la modale détruit le composant → le cache repart à zéro à la réouverture.

## Rendu des barres comparatives

- Une ligne par `StatLine` :
  - valeur domicile (gauche) · **label centré** · valeur extérieur (droite) ;
  - sous le label, une **barre bicolore** pleine largeur : segment gauche (domicile) +
    segment droit (extérieur), proportions = `home / (home + away)` et `away / (home + away)` ;
    si `home + away === 0`, barre neutre 50/50 grisée.
  - couleurs des segments via `getFlagBg(homeName)` / `getFlagBg(awayName)`.
- `percent` affiché `55%` ; `number` affiché tel quel (xG en décimal, ex. `1.8`).
- Style cohérent avec la modale (fond sombre, police Anton pour labels/valeurs).

## États

| État              | Condition                                  | Rendu                                              |
|-------------------|--------------------------------------------|----------------------------------------------------|
| Chargement        | appel en cours                             | spinner (même style que le lineup-spinner)         |
| Vide              | `data: []` (match non commencé / pas de stats) | message « Statistiques pas encore disponibles » |
| Erreur            | appel échoué                               | message d'erreur rouge (même style que la modale)  |
| Données           | `data.length > 0`                          | barres comparatives                                |

## Tests / vérification

- Type-check : `npx vue-tsc --noEmit`.
- Déploiement de l'edge function `match-stats-proxy` (Supabase).
- Vérif manuelle navigateur :
  - match terminé (ex. fixture 215662) → stats présentes, orientation correcte ;
  - match futur → état vide ;
  - bascule entre onglets sans re-fetch au 2ᵉ clic.

## Hors périmètre (YAGNI)

- Stats par joueur (`fixtures/players`).
- Onglet « Events » / timeline.
- Persistance des stats en base ou temps réel (l'appel est à la demande, à l'ouverture).
