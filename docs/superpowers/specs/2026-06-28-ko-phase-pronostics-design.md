# Intégration des pronostics de phase finale (élimination directe)

Date : 2026-06-28
Statut : conception validée (mécanisme + automatisation)

## Contexte

La Coupe du Monde 2026 (48 équipes) vient de terminer sa phase de poules
(dernier match le 27/06). La phase à élimination directe commence le 28/06 par
un **tour de 32** (Round of 32, 16 matchs), puis 16es, quarts, demies, 3e place
et finale.

Aujourd'hui la base ne contient que les **72 matchs de poules** (`stage='group'`,
équipes connues). **Aucun match d'élimination directe n'existe.** L'onglet
« Élimination » de `TabMatchs.vue` filtre sur `m.stage ∈ {r32,r16,qf,sf,3rd,final}`
et reste donc vide. Les participants ne peuvent pas pronostiquer la phase finale.

### Source de données

Les matchs KO doivent venir d'**api-sports** (`v3.football.api-sports.io`,
endpoint `fixtures?league=1&season=2026`) — exactement l'appel que `sync-wc26`
(scores live) fait déjà. C'est décisif :

- **Même espace d'ids** que la base (les `id` en base SONT les `fixture.id`
  api-sports, ex. `1489369`). Les matchs KO insérés porteront donc le bon `id`,
  et les **scores/buteurs live fonctionneront automatiquement** via `sync-wc26`,
  sans le problème d'espace d'ids qu'aurait `wc26-live-football-api`.
- Données réelles vérifiées (sonde temporaire le 28/06) : l'API renvoie 88
  fixtures = 72 poules + **16 « Round of 32 »**, équipes déjà déterminées
  (ex. South Africa vs Canada), dates/venues réels, statut `NS`, 1er coup
  d'envoi le 28/06 19:00 UTC. Les rounds suivants (16es…finale) **ne sont pas
  encore** dans le flux — ils y apparaîtront au fil du tableau.

### État de `sync-schedule` (à réécrire)

L'edge function `sync-schedule` existante est **cassée et obsolète** :
- interroge `wc26-live-football-api` avec une **clé RapidAPI morte** (« You are
  not subscribed to this API ») ;
- utilise un **espace d'ids différent** de la base ;
- écrit une colonne **`round` qui n'existe pas** dans la table `matches`
  (l'upsert échouerait) ;
- traduit les noms en français via `TEAM_EN_FR` alors que la base stocke les
  noms **en anglais** (« Mexico », « South Africa »…).

Elle n'a donc jamais tourné avec succès contre cette base. Elle est déjà câblée
au bouton admin **« SYNC HORAIRES »** (`admin.syncSchedule`) → candidat idéal à
réécrire, sans nouvelle UI.

## Décision

1. **Réécrire `sync-schedule`** pour qu'elle interroge api-sports, ne traite que
   les fixtures à élimination directe, et **upsert** les matchs KO dans `matches`.
2. **Cron automatique** (`pg_cron`) pour rejouer la sync périodiquement et
   intégrer les rounds suivants dès qu'ils apparaissent.
3. La lancer immédiatement pour insérer les 16 R32 (ouverture des pronostics).
4. Petit ajustement UI : l'entête des cartes KO dérive son libellé du `stage`
   (la colonne `round` n'existe pas).

## Conception détaillée

### Edge function `sync-schedule` (réécriture)

Calquée sur `sync-odds` / `sync-wc26` (mêmes constantes, même `TEAM_ALIAS`).

1. `fetch fixtures?league=1&season=2026` avec `x-apisports-key`.
2. Pour chaque fixture, mapper `league.round` → `stage` :

   | `league.round` (api-sports) | `stage` |
   |-----------------------------|---------|
   | `Round of 32`               | `r32`   |
   | `Round of 16`               | `r16`   |
   | `Quarter-finals`            | `qf`    |
   | `Semi-finals`               | `sf`    |
   | `3rd Place Final`           | `3rd`   |
   | `Final`                     | `final` |

   Tout round commençant par `Group Stage` → **ignoré** (matchs de poules déjà
   en base ; on n'y touche pas pour ne pas écraser leur heure locale/ville).
   Un round inconnu → ignoré et compté dans `skippedUnknownRound`.

3. Détermination des équipes. Les noms api-sports passent par `norm()`
   (`TEAM_ALIAS`, ex. `Czechia→Czech Republic`) pour rester cohérents avec la
   base (anglais) et avec l'orientation de `sync-wc26`.
   - Équipe **connue** (nom présent et non-placeholder) →
     `home_team = norm(name)`, `home_label = null`.
   - Équipe **à définir** (nom absent ou motif placeholder
     `/^(Winner|Loser|W\d|L\d|\d)/i`) → `home_team = null`,
     `home_label = name || '?'`.
   - Idem côté `away`.

4. Date / heure (depuis l'ISO api-sports `fixture.date`,
   ex. `2026-06-28T19:00:00+00:00`) :
   - `match_date` = partie date UTC (`2026-06-28`).
   - `match_time` = `HH:MM:SS+00` (UTC). `matchStartsAtMs` lit l'offset → instant
     absolu correct ; l'affichage reste en heure locale du navigateur, comme les
     poules.

5. Construire une ligne d'upsert **à colonnes homogènes** pour chaque match KO :
   `{ id, stage, home_team, away_team, home_label, away_label, group_id:null,
   match_date, match_time, venue }`.
   - `live_status` **non inclus** : appartient à `sync-wc26` (défaut → traité
     comme `scheduled` par `mapMatchRow`).
   - `result_*`, `goals_*`, `cards_*`, `odds_*` **non inclus** : jamais touchés
     → ré-exécutions idempotentes, aucune perte de données saisies.

6. `upsert(rows, { onConflict: 'id' })` par lots de 50.
7. Réponse JSON : `{ synced, skippedUnknownRound }`.

**Idempotence / reprise des rounds.** À chaque exécution, les R32 sont
ré-upsertés (sans effet de bord) et tout nouveau round présent dans le flux est
inséré. Quand une équipe « à définir » devient connue, l'upsert renseigne
`home_team`/`away_team` et remet le `*_label` à `null` (les deux colonnes sont
toujours dans la ligne).

### Cron (`pg_cron`)

Nouvelle migration, calquée sur `sync-odds-daily`. Job `sync-schedule-daily`,
**une fois par jour à 08:00 heure de Paris** (= `0 6 * * *` en UTC, CEST=UTC+2),
`net.http_post` vers `…/functions/v1/sync-schedule`. Une requête fixtures par
exécution (coût quota négligeable). Un nouveau round est intégré le lendemain
matin de sa publication — l'admin peut toujours forcer via « SYNC HORAIRES ».

### Ajustement UI (`TabMatchs.vue`)

La colonne `round` n'existe pas → `m.round` est toujours `''`. Ajouter un helper
`koStageLabel(m)` qui mappe `m.stage` vers le libellé `KO_STAGES`
(`r32→32èmes`, … `final→Finale`) et l'utiliser :
- entête des cartes KO (ligne ~512, remplace `{{ m.round }}`) ;
- `matchStageLabel` du mode Live (remplace le fallback `m.round || 'ÉLIMINATION'`
  pour un match non-`group`).

Aucun changement de schéma, aucune autre logique modifiée. Le verrouillage des
pronostics au coup d'envoi, le joker, le calcul des points et l'orientation des
scores s'appliquent déjà tels quels aux matchs KO.

## Hors périmètre (YAGNI)

- Pas de colonne `round` ajoutée (libellé dérivé du `stage`).
- Pas de mise à jour des horaires/venues des matchs de poules.
- Pas de refonte de `sync-wc26` (les scores live KO marchent déjà via l'id).
- Pas de gestion de bracket/arbre visuel.

## Nettoyage

Supprimer la fonction de sonde temporaire `probe-ko` (déjà neutralisée en 410)
via `supabase functions delete probe-ko`.

## Critères de réussite

- Après lancement, les 16 R32 apparaissent dans l'onglet « Élimination » (pill
  « 32èmes »), équipes et drapeaux corrects, pronostics saisissables avant le
  coup d'envoi.
- Ré-exécuter la sync ne modifie ni les scores ni les pronostics existants.
- Quand les 16es seront publiés par l'API, le cron les insère automatiquement.
- Les scores live d'un match KO se mettent à jour via `sync-wc26` sans action
  supplémentaire.
