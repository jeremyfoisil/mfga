# Cotes des matchs (Unibet — vainqueur du match)

**Date :** 2026-06-19
**Statut :** Design validé

## Objectif

Afficher, sur chaque carte de match, les cotes du bookmaker **Unibet** (API-Sports
bookmaker `id=16`) pour le pari **« Match Winner »** (bet `id=1`) : cote domicile /
nul / extérieur. Les cotes sont affichées dès qu'elles sont disponibles et **restent
visibles quel que soit l'état du match** (à venir, en direct, terminé).

Source : `https://v3.football.api-sports.io/odds?league=1&season=2026`, filtré sur
`bookmaker=16` et `bet=1`. Même API et même clé (`APISPORTS_KEY`) que `sync-wc26`.

## 1. Modèle de données

Migration ajoutant trois colonnes à `public.matches` :

```sql
alter table public.matches
  add column if not exists odds_home numeric(6,2),
  add column if not exists odds_draw numeric(6,2),
  add column if not exists odds_away numeric(6,2);
```

- `NULL` = cote indisponible (la ligne d'affichage n'apparaît que si les **trois**
  cotes sont non nulles).
- Cotes stockées **orientées comme la DB** : `odds_home` correspond à `home_team`,
  `odds_away` à `away_team`.

## 2. Edge function `sync-odds`

Nouvelle fonction Deno dans `supabase/functions/sync-odds/index.ts`, sur le modèle
de `sync-wc26` / `sync-schedule`.

### Étape A — Orientation

Nos paires de matchs proviennent d'une autre source que les résultats API-Sports ;
l'orientation domicile/extérieur peut différer (c'est pourquoi `sync-wc26` calcule un
`flipped`). La réponse `/odds` ne contient pas les noms d'équipes, seulement
`fixture.id`. On récupère donc d'abord l'orientation :

1. `fixtures?league=1&season=2026` → map `fixtureId → nom équipe domicile API`.
2. Pour chaque fixture, comparer à `db.home_team` (avec le même `norm()` /
   `TEAM_ALIAS` que `sync-wc26`) pour déterminer `flipped`.

### Étape B — Cotes (paginé)

Boucler sur les pages de `odds?league=1&season=2026&bookmaker=16&bet=1`
(jusqu'à `paging.current >= paging.total`). Pour chaque entrée :

- Extraire `bookmakers[0].bets[0].values` (déjà filtré côté API).
- Lire les valeurs `Home`, `Draw`, `Away` (parser l'`odd` string → number).

### Étape C — Upsert

Construire des lignes `{ id, odds_home, odds_draw, odds_away }` orientées selon
`flipped` (si flipped : `odds_home ← Away`, `odds_away ← Home`). Upsert par lots
(`onConflict: 'id'`), avec des clés homogènes — même prudence que `sync-wc26` pour
ne jamais écraser d'autres colonnes en NULL.

Réponse : `{ synced: <nombre de matchs mis à jour> }`.

### Garde-fous

- Ne jamais écraser des cotes existantes par des NULL si une page revient vide /
  throttlée : n'écrire une ligne que si on a effectivement lu les trois cotes.
- Échecs d'appel API → réponse `502` (comme `sync-wc26`).

## 3. Cron quotidien

Job pg_cron `sync-odds-daily`, calqué sur `sync-wc26-every-minute`, à **06:00 UTC** :

```sql
select cron.schedule(
  'sync-odds-daily',
  '0 6 * * *',
  $$ select net.http_post(
       url := 'https://sazupuqxwrnvgzsdxkjg.supabase.co/functions/v1/sync-odds',
       headers := '{"Content-Type": "application/json"}'::jsonb,
       body := '{}'::jsonb
     ); $$
);
```

Versionné dans une migration `supabase/migrations/`.

## 4. Bouton admin

- `src/stores/admin.ts` : action `syncOdds()` calquée sur `syncSchedule()`
  (`oddsLoading`, `oddsMsg`, timer de reset), qui invoque `sync-odds` puis recharge
  `matches` (`select('*')` + `mapMatchRow`).
- `src/components/tabs/TabMatchs.vue` : bouton **💰 SYNC COTES** dans la barre admin,
  à côté de SYNC SCORES / SYNC HORAIRES, avec affichage de `oddsMsg`.

## 5. Affichage (front)

### Type & mapping

- `Match` (dans `src/types/index.ts`) gagne :
  `oddsHome: number | null`, `oddsDraw: number | null`, `oddsAway: number | null`.
- `mapMatchRow` (`src/utils/match.ts`) mappe `odds_home/odds_draw/odds_away`
  (coercition `Number`, `null` si absent).

### Composant

Petit composant factorisé (ex. `src/components/ui/MatchOdds.vue`) prenant un `Match`
en prop, pour éviter de dupliquer le markup dans les trois cartes (Live, Groupes,
Élimination). Il rend une ligne compacte sous le bloc équipes :

```
🇫🇷 France   VS   Brésil 🇧🇷
  2.10       3.40      3.20
```

- Trois valeurs alignées sous domicile / nul / extérieur (même grille
  `1fr auto 1fr` que le bloc équipes).
- La cote **la plus basse (favori)** est mise en valeur en couleur accent.
- Petite légende discrète « Cotes Unibet ».
- **Condition d'affichage :** uniquement si `oddsHome`, `oddsDraw` et `oddsAway`
  sont tous non nuls. Aucune condition sur l'état du match — visible à venir,
  en direct et terminé.
- Pour les matchs KO à équipes inconnues : pas de cotes (donc rien à afficher).

### Intégration

Inséré dans les trois cartes de `TabMatchs.vue`, juste après le bloc équipes
(`grid-template-columns: 1fr auto 1fr`) et avant le panneau pronostic/résultat.

## Hors périmètre (YAGNI)

- Autres bookmakers ou autres types de paris.
- Historique de l'évolution des cotes.
- Affichage des cotes dans d'autres onglets que Matchs.
