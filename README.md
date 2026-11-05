# Diagnostic RSE des espaces extérieurs — application de collecte terrain

Application web mobile-first (PWA) qui permet à un chargé d'affaires de **collecter, sur site et même sans réseau**, toutes les informations nécessaires au « Diagnostic RSE des espaces extérieurs » offert aux prospects : qualification commerciale, inventaire des zones, questionnaire RSE en 6 piliers, photos, dictée vocale, score et synthèse immédiate. Le bureau suit ensuite les visites, exporte (JSON, PDF, CSV) et relance.

- **Front** : React 18 + TypeScript + Vite + Tailwind CSS, PWA (`vite-plugin-pwa`)
- **Hors ligne** : IndexedDB via Dexie (photos compressées à 1600 px max), synchronisation automatique au retour du réseau
- **Backend** : Supabase (magic link, Postgres, Storage) derrière une couche « repository » remplaçable
- **PDF** : `@react-pdf/renderer` (côté client) — **Radar** : Recharts
- **Questionnaire et scoring pilotés par un fichier YAML** (`referentiel/v2.yaml`), modifiable sans coder

---

## Sommaire

1. [Démarrage rapide (mode local)](#1-démarrage-rapide-mode-local)
2. [Le parcours d'une visite](#2-le-parcours-dune-visite)
3. [Architecture et modèle de données](#3-architecture-et-modèle-de-données)
4. [Configuration (variables d'environnement)](#4-configuration-variables-denvironnement)
5. [Mise en place de Supabase](#5-mise-en-place-de-supabase)
6. [Déploiement (Vercel ou Netlify)](#6-déploiement-vercel-ou-netlify)
7. [Installer l'application sur un téléphone](#7-installer-lapplication-sur-un-téléphone)
8. [Modifier le référentiel de questions sans coder](#8-modifier-le-référentiel-de-questions-sans-coder)
9. [Exports](#9-exports)
10. [Brouillon de diagnostic par IA (optionnel)](#10-brouillon-de-diagnostic-par-ia-optionnel)
11. [RGPD et sécurité](#11-rgpd-et-sécurité)
12. [Personnalisation](#12-personnalisation)
13. [Évolutions : changer de backend, connecteur Extrabat](#13-évolutions--changer-de-backend-connecteur-extrabat)
14. [Limites connues](#14-limites-connues)
15. [Commandes utiles](#15-commandes-utiles)

---

## 1. Démarrage rapide (mode local)

Prérequis : **Node.js 20 ou plus récent** et npm.

```bash
npm install
cp .env.example .env     # sous Windows : copy .env.example .env
npm run dev
```

Ouvrir l'adresse affichée (par défaut <http://localhost:5173>).

Tant que `VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY` sont vides, l'application tourne en **mode local** : une connexion de démonstration (nom + rôle *Terrain* ou *Bureau*) remplace l'authentification, la synchronisation est désactivée et un bandeau « Mode local » est affiché. Toutes les données restent dans le navigateur (IndexedDB). C'est idéal pour essayer l'application ou former les équipes.

> En mode local, les profils « terrain » et « bureau » d'un même navigateur partagent la même base locale.

### Données de test (pré-remplissage)

Pour essayer ou recetter l'application sans tout saisir, des boutons **🧪** (cadre ambre en pointillés) remplissent la visite avec des données **fictives** (entreprises préfixées `[TEST]`, e-mails en `.example`, numéros `01 99 00 xx xx`) :

| Où | Bouton | Effet |
|---|---|---|
| Accueil (terrain) et tableau de bord (bureau) | *Créer une visite de test complète* | Crée une visite entièrement remplie (fiche, RGPD, questionnaire, zones, photos, notes vocales, signature, statut et relance, scores). |
| Sommaire d'une visite | *Remplir toute la visite (test)* | Complète tout ce qui est vide dans la visite. |
| Préparation / Nouvelle visite | *Pré-remplir la fiche (test)* | Complète les champs vides de la fiche prospect. |
| Une section du questionnaire | *Remplir cette section (test)* | Répond aux questions visibles sans réponse (les questions conditionnelles suivent le référentiel). |
| Zones | *Ajouter des zones de test* | Ajoute des zones typées (surface, taille, état, observation) et complète les zones existantes. |

Les boutons **ne remplacent jamais** une saisie existante et peuvent être relancés sans créer de doublons. Ils ne clôturent pas la visite. Ils sont toujours visibles en mode local (donc sur un déploiement sans Supabase, comme la démo Azure) ; avec un vrai serveur ils restent masqués, sauf si `VITE_FEATURE_DONNEES_TEST=true` (à réserver à un environnement de test, jamais à la production : les données fictives seraient synchronisées).

---

## 2. Le parcours d'une visite

| Étape | Écran | Contenu |
|---|---|---|
| 1. Préparation (bureau) | *Préparation* | Fiche prospect (raison sociale, SIRET, adresse, secteur, effectif, contact). Pré-remplissage depuis le SIRET via l'API publique *Recherche d'entreprises*. Lien vers la vue satellite de l'adresse. |
| 2. Information RGPD | *RGPD* | Texte d'information affiché au prospect avant la collecte, case de consentement pour recevoir le rapport. |
| 3. Qualification commerciale | Section « Qualification » | Statut d'occupation, décideur / payeur, entretien actuel, démarche RSE, attentes et irritants (dictée). |
| 4. Inventaire par zones | *Zones* | Types de zones, surface (m² ou petit/moyen/grand), état, photo. |
| 5. Questionnaire RSE | 6 piliers | Questions fermées (Oui / Non / Partiel / Ne sait pas, choix, compteurs, curseurs), aide « pourquoi c'est important », photo et dictée sur chaque question. |
| 6. Synthèse immédiate | *Synthèse* | Score par pilier et global, radar, points forts, 3 à 5 pistes prioritaires, signature du prospect. |
| 7. Clôture | *Clôture* | Statut (à rédiger / rédigé / envoyé / devis à faire), prochaine action, date de relance, exports. |

Principes UX respectés : gros boutons et contraste élevé, sauvegarde automatique à chaque réponse, reprise d'une visite interrompue, barre de progression par section, sections ignorables puis reprenables, micro « note vocale libre » disponible partout, photos horodatées et géolocalisées.

**Chronométrage** : chaque section (qualification, 6 piliers) et l'inventaire des zones affichent un **temps estimé de remplissage** (« ~4 min »). Un **chrono** démarre tout seul à la **première modification** de la section (réponse, commentaire, photo, zone…) ; il ne compte que lorsque l'écran est affiché et peut être mis en pause d'un appui. Il repart à chaque retour sur la section et se cumule. Le sommaire de la visite montre, pour chaque étape, le temps estimé et le temps passé, ainsi que le total de la collecte face à l'objectif (30 min par défaut). Les temps sont enregistrés avec la visite (donc synchronisés) et repris dans l'export JSON (`chronometrage`) et le CSV (« Durée de collecte (min) »).

Le **tableau de bord Bureau** (rôle `bureau`) liste toutes les visites, filtre par statut, met en avant les **relances à faire** et exporte le pipeline en CSV.

---

## 3. Architecture et modèle de données

```
src/
├── referentiel/   Schéma (zod), parseur YAML, chargement du référentiel actif
├── scoring/       Moteur de scoring déclaratif (aucune règle en dur)
├── domain/        Types métier (Prospect, Site, Visite, Zone, Reponse, Photo…)
├── db/            Base locale Dexie (IndexedDB)
├── repository/    Dépôt local (écritures), synchronisation, interface DepotDistant
│   └── supabase/  Adaptateur Supabase (auth, base, Storage)
├── export/        JSON, CSV, PDF (react-pdf)
├── components/ pages/ hooks/ lib/ config/
referentiel/       v1.yaml (archive) et v2.yaml (actif) : questionnaire + règles de score — à éditer sans coder
supabase/          Migration SQL (tables + RLS), fonction Edge « brouillon-diagnostic »
```

**Principe « local d'abord »** : l'application lit et écrit **toujours** dans IndexedDB. Un moteur de synchronisation envoie les changements au serveur (et récupère ceux des autres appareils) quand le réseau est disponible. Les conflits sont résolus en « dernière écriture gagne » (horodatage serveur).

**Entités** : `Utilisateur` (profil + rôle), `Prospect`, `Site`, `Visite` (référence la version du référentiel utilisée), `Zone`, `Réponse`, `Photo`, `NoteVocale`, `Score`, `Recommandation`, `StatutCommercial`. Le schéma Postgres correspondant est dans `supabase/migrations/0001_init.sql`, avec des politiques RLS : un chargé d'affaires ne voit que ses visites, le bureau voit tout.

**Scoring** : score d'un pilier = moyenne pondérée (`poids`) des questions répondues et notées ; score global = moyenne pondérée des piliers évalués (`poidsPilier`). « Ne sait pas » et « sans objet » ne comptent pas. Les *quick wins* sont les réponses faibles les plus pondérées (priorité = poids × (100 − score)), plafonnées par pilier. Le niveau de maturité (Débutant / En progression / Avancé / Exemplaire) vient des seuils du référentiel.

---

## 4. Configuration (variables d'environnement)

Copier `.env.example` en `.env` (local) ou déclarer ces variables chez l'hébergeur (Vercel / Netlify).

| Variable | Où | Rôle |
|---|---|---|
| `VITE_SUPABASE_URL` | front | URL du projet Supabase. Vide = mode local. |
| `VITE_SUPABASE_ANON_KEY` | front | Clé publique « anon » (protégée par les règles RLS). **Jamais la clé `service_role`.** |
| `VITE_FEATURE_BROUILLON_IA` | front | `true` pour afficher le bouton « Générer le brouillon du diagnostic ». |
| `VITE_FEATURE_DONNEES_TEST` | front | `true` pour afficher les boutons 🧪 de pré-remplissage avec un vrai serveur (toujours affichés en mode local). Voir §1. |
| `VITE_ENTREPRISE_NOM` / `_ADRESSE` / `_TELEPHONE` / `_EMAIL` / `_SITE` | front | Coordonnées de l'entreprise (en-tête du PDF, mentions). Par défaut des marqueurs `[NOM_ENTREPRISE]`… sont affichés. |
| `VITE_ENTREPRISE_EMAIL_RGPD` | front | Adresse d'exercice des droits RGPD (par défaut : `VITE_ENTREPRISE_EMAIL`). |
| `FEATURE_BROUILLON_IA`, `LLM_API_KEY`, `LLM_API_URL`, `LLM_MODEL` | **serveur** (secrets Supabase) | Fonction Edge du brouillon IA. **Jamais préfixées `VITE_`** : tout ce qui est préfixé `VITE_` est visible dans le navigateur. |

---

## 5. Mise en place de Supabase

1. **Créer un projet** sur <https://supabase.com> (région UE recommandée pour le RGPD).
2. **Créer le schéma** : ouvrir *SQL Editor*, coller le contenu de `supabase/migrations/0001_init.sql` et l'exécuter.
   Alternative avec le CLI : `supabase link --project-ref <ref>` puis `supabase db push`.
   Le script crée les tables, les règles RLS, le déclencheur de profil, les déclencheurs de synchronisation et le bucket privé `photos`.
   Exécuter ensuite, dans l'ordre, les migrations suivantes du dossier `supabase/migrations/` (`0002_chronos.sql` : colonne du chronomètre par section). Avec `supabase db push`, tout est appliqué automatiquement.
3. **Authentification** (*Authentication → Providers*) : activer *Email* (magic link). L'application utilise `shouldCreateUser: false` : **seuls les utilisateurs invités peuvent se connecter**.
   - *Authentication → URL Configuration* : renseigner **Site URL** (l'adresse de production) et ajouter l'adresse de production (et `http://localhost:5173` pour le développement) dans **Redirect URLs**.
4. **Inviter les utilisateurs** : *Authentication → Users → Invite user*. Un nouvel utilisateur reçoit par défaut le rôle `terrain`.
5. **Donner le rôle « bureau »** au gérant / à l'assistante, dans le *SQL Editor* :
   ```sql
   update public.profils set role = 'bureau' where email = 'assistante@votre-entreprise.fr';
   ```
6. **Récupérer les clés** (*Project Settings → API*) : `Project URL` → `VITE_SUPABASE_URL`, clé `anon` → `VITE_SUPABASE_ANON_KEY`.
7. *(Recommandé)* Configurer un expéditeur SMTP personnalisé (*Authentication → SMTP*) : le service d'e-mail intégré de Supabase est très limité en nombre d'envois.

> Le **premier** lien magique nécessite du réseau. Ensuite, la session reste ouverte et l'application fonctionne hors ligne.

---

## 6. Déploiement (Vercel ou Netlify)

Les fichiers `vercel.json`, `netlify.toml` et `public/_redirects` sont fournis (réécriture SPA, pas de cache sur `sw.js`, en-têtes de sécurité).

**Réglages communs** (importer le dépôt Git dans le service) :

| Réglage | Valeur |
|---|---|
| Framework | Vite |
| Commande de build | `npm test && npm run build` |
| Dossier de sortie | `dist` |
| Variables d'environnement | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_ENTREPRISE_*`, éventuellement `VITE_FEATURE_BROUILLON_IA` |

La commande `npm test && npm run build` est volontaire : **un référentiel YAML invalide fait échouer le déploiement** au lieu de casser l'application en production.

Après le premier déploiement, reporter l'URL publique dans *Authentication → URL Configuration* de Supabase (étape 3 ci-dessus).

**Mise à jour de l'application** : à chaque déploiement, le *service worker* télécharge la nouvelle version et l'active au prochain rechargement.

### Alternative : Azure Static Web Apps

Le fichier `public/staticwebapp.config.json` (réécriture SPA, en-têtes, pas de cache sur `sw.js`) est copié dans `dist/` au build. Offre *Free* : HTTPS inclus, coût nul pour cet usage.

```bash
az login
az group create -n rg-rse-diag -l westeurope
az staticwebapp create -n swa-rse-diag -g rg-rse-diag -l westeurope --sku Free   # une seule fois

# À chaque déploiement : build (les variables VITE_* doivent être définies AVANT le build)
npm test && npm run build
$env:SWA_CLI_DEPLOYMENT_TOKEN = (az staticwebapp secrets list -n swa-rse-diag -g rg-rse-diag --query "properties.apiKey" -o tsv)
npx @azure/static-web-apps-cli deploy ./dist --env production
```

Les variables `VITE_*` étant intégrées **au moment du build**, les définir dans `.env` (ou dans l'environnement) avant `npm run build`. Le jeton de déploiement est un secret : ne pas le versionner. Le déploiement crée un zip temporaire à la racine du projet (à supprimer s'il subsiste ; il fait planter un `npm run dev` en cours).

---

## 7. Installer l'application sur un téléphone

- **Android (Chrome)** : ouvrir l'adresse, menu ⋮ → *Installer l'application* (ou *Ajouter à l'écran d'accueil*).
- **iPhone / iPad (Safari)** : bouton Partager → *Sur l'écran d'accueil*.

Avant de partir en visite : ouvrir l'application **une fois avec du réseau** (pour mettre l'application en cache et se connecter), préparer la visite, puis partir. Sur site, tout fonctionne sans réseau ; la synchronisation reprend seule au retour de la connexion (un indicateur d'état est visible en haut de l'écran).

Autoriser l'**appareil photo**, la **localisation** et le **micro** quand le navigateur le demande.

---

## 8. Modifier le référentiel de questions sans coder

Tout le questionnaire (questions, poids, règles de score, pistes d'amélioration, prestations liées, niveaux de maturité, types de zones) est dans **`referentiel/v2.yaml`** (version active ; `v1.yaml` est conservé pour les visites déjà créées). Aucun code n'est à modifier : un simple éditeur de texte suffit (YAML : l'**indentation compte**, utiliser des espaces, jamais de tabulations).

> **Version 2** : fusion des 27 critères candidats de l'étude de marché (EcoJardin 2026 et coefficient de biotope) avec le questionnaire V1. 13 questions ont été ajoutées (repérées par le commentaire `NOUVEAU V2` dans le fichier), 3 options et 1 libellé reformulé. Les questions « ombre aux postes extérieurs » et « risque chaleur au document unique » ne s'affichent que si la qualification indique que des salariés travaillent dehors, pour ne pas allonger la visite.

### Procédure

1. Modifier `referentiel/v2.yaml` (ou, pour **faire évoluer la version**, copier le fichier en `referentiel/v3.yaml` et passer `version: "3.0.0"`).
2. Valider : `npm run verifier-referentiel` (ou `npm test`). Les erreurs indiquent le chemin exact du problème (ex. `sections[2].questions[4].poids`).
3. Déployer (un `git push` suffit si le déploiement est branché sur le dépôt). Le référentiel est embarqué dans l'application au moment du build.

### Règles de versionnage

- Le référentiel actif pour les **nouvelles** visites est celui qui porte **la version la plus élevée** parmi les fichiers `referentiel/*.yaml`.
- Une visite existante **conserve la version** utilisée à sa création : ses scores ne changent jamais rétroactivement.
- Ne supprimez pas un ancien fichier tant que des visites l'utilisent. Ne changez jamais l'`id` d'une question existante dans une même version.

### Exemple : ajouter une question

Dans la section voulue (`sections → questions`) :

```yaml
- id: bio_nichoirs_pose        # identifiant unique, sans espace ni accent
  libelle: "Des nichoirs ont-ils été posés ?"
  type: bool                   # bool | choix | nombre | texte | photo | date
  poids: 2                     # 0 = non notée ; plus c'est haut, plus ça pèse
  pourquoi: "Les nichoirs offrent un abri aux oiseaux des jardins."   # affiché en aide
  piste:                       # proposée si la réponse est mauvaise (quick win)
    titre: "Poser des nichoirs"
    texte: "Installer 3 à 5 nichoirs adaptés aux espèces locales."
    effort: faible             # faible | moyen | eleve
  prestation: abris_faune      # id présent dans la liste « prestations »
  score: { oui: 100, partiel: 50, non: 0 }   # facultatif : ces valeurs sont les défauts
```

### Référence des champs

**Niveau supérieur** : `version`, `nom`, `niveaux` (id, libellé, seuil `min`, couleur), `quickWins` (`max`, `seuil`, `maxParPilier`), `pointsForts` (`max`, `seuil`), `prestations` (id, libellé, description), `zones` (`types`, `etats`, `tailles`), `durees` (optionnel), `sections`.

**Durées estimées (`durees`, optionnel)** : temps de remplissage estimé, en **secondes par question visible**, selon son type : `bool`, `choix`, `nombre`, `texte`, `photo`, `date` (défauts : 12, 15, 12, 30, 20, 10). `zones` = durée estimée de l'inventaire des zones (défaut 240 s) et `objectifMinutes` = objectif de durée de la collecte (défaut 30). L'estimation d'une section est la somme des questions affichées : les questions conditionnelles (`afficherSi`) s'ajoutent quand elles apparaissent. Exemple :
```yaml
durees:
  texte: 45        # une question à dictée prend plus de temps chez nous
  zones: 300
  objectifMinutes: 30
```

**Section** : `id`, `libelle`, `libelleCourt` (30 caractères max, affiché sur le radar), `type` (`qualification` = non notée, ou `pilier`), `icone`, `description`, `poidsPilier` (poids dans le score global, 1 par défaut), `questions`.

**Question (communs)** : `id`, `libelle`, `type`, `poids` (0 à 10), `pourquoi`, `piste` (`titre`, `texte`, `effort`), `prestation`, `afficherSi` (`question` + `dans` ou `sauf` : n'affiche la question que selon une réponse précédente), `cleExport` (nom de colonne dans l'export CSV).

| Type | Champs spécifiques et règles de score |
|---|---|
| `bool` | `reponses` (sous-ensemble de `oui`, `non`, `partiel`, `nsp`), `sansObjet`, `score: { oui, non, partiel, nsp }`. Par défaut oui = 100, partiel = 50, non = 0. *Ne sait pas* et *sans objet* sont **exclus** du score. Pour une question « négative » (ex. espèces invasives), inverser : `score: { oui: 0, non: 100 }`. |
| `choix` | `options` (liste de `valeur`, `libelle`, `score`, `exclusif`), `multiple: true` pour plusieurs réponses, `agregat` (`somme` plafonnée à 100 par défaut, `max`, `moyenne`, `min`). |
| `nombre` | `unite`, `min`, `max`, `pas`, `affichage` (`compteur` ou `curseur`), `score: { tranches: [{ jusqua, score }, …] }` — tranches classées par `jusqua` (borne haute incluse), la dernière sans borne. |
| `texte` | `multiligne: true/false` (dictée vocale disponible dans tous les cas). |
| `photo` | Photo seule, non notée. |
| `date` | Sélecteur de date, non noté. |

Le **haut du fichier `v2.yaml`** contient un aide-mémoire reprenant ces règles.

---

## 9. Exports

Disponibles depuis l'écran *Clôture* (et le tableau de bord *Bureau* pour le CSV).

- **JSON structuré** (`schema: "rse-diag/visite@1"`) : référentiel utilisé, visite, **chronométrage** (temps estimé et temps passé par étape), prospect, site, qualification, réponses (avec libellés), zones, observations, **transcriptions vocales**, liens/métadonnées des photos, scores, points forts, recommandations, statut commercial. C'est l'entrée de la rédaction assistée par IA.
- **Pré-rapport PDF** : logo, coordonnées, synthèse, radar, points forts, pistes prioritaires, inventaire des zones, constats par pilier avec photos, mention « **Diagnostic offert** » et rappel RGPD. Document de travail à relire avant envoi.
- **CSV** de toutes les visites (pipeline commercial) : encodage UTF-8 avec BOM, séparateur `;`, directement ouvrable dans Excel et importable dans Google Sheets.

---

## 10. Brouillon de diagnostic par IA (optionnel)

Fonctionnalité désactivée par défaut (*feature flag*). Elle envoie le **JSON de la visite** à un LLM depuis une **fonction Edge Supabase** : la clé API n'existe **que côté serveur**.

1. Installer le CLI Supabase et se connecter : `supabase login`, `supabase link --project-ref <ref>`.
2. Déclarer les secrets (jamais dans le front) :
   ```bash
   supabase secrets set FEATURE_BROUILLON_IA=true LLM_API_KEY=sk-... \
     LLM_API_URL=https://api.openai.com/v1/chat/completions LLM_MODEL=gpt-4o-mini
   ```
   (`LLM_API_URL` et `LLM_MODEL` sont facultatifs ; toute API compatible « chat completions » convient.)
3. Déployer la fonction : `supabase functions deploy brouillon-diagnostic`.
4. Activer le bouton côté front : `VITE_FEATURE_BROUILLON_IA=true`, puis redéployer.

Le **prompt de rédaction** est dans `supabase/functions/brouillon-diagnostic/prompt-redaction.md` (modifiable sans coder, puis redéployer la fonction). Il impose : aucune donnée inventée, `[à compléter]` pour toute information manquante.

Le texte généré est **toujours un brouillon modifiable**, à relire et valider par un humain avant tout envoi. La fonction exige un utilisateur authentifié (JWT vérifié).

---

## 11. RGPD et sécurité

- **Authentification obligatoire** (magic link, utilisateurs invités uniquement) ; rôles `terrain` et `bureau` appliqués par des règles RLS dans la base (pas seulement dans l'interface).
- **Données personnelles minimales** : nom, fonction, e-mail/téléphone professionnels du contact.
- **Information et consentement** : le texte d'information est affiché au prospect avant la collecte, avec une case de consentement pour recevoir le rapport. Le texte figure dans `src/config/entreprise.ts` (`informationRgpd`).
  **À faire valider par votre DPO / juriste avant mise en production**, ainsi que les durées de conservation.
- Les **photos** sont stockées dans un bucket **privé** (accès par URL signée, dossier par utilisateur).
- **Aucune clé secrète dans le front** : seule la clé publique `anon` est embarquée. Les clés LLM restent des secrets Supabase.
- Les données sont stockées localement sur l'appareil (IndexedDB) tant qu'elles ne sont pas synchronisées : activer le verrouillage d'écran du téléphone.

---

## 12. Personnalisation

- **Coordonnées de l'entreprise** : variables `VITE_ENTREPRISE_*` (§ 4).
- **Logo et icônes** : remplacer `public/logo.png` (carré, idéalement 512 × 512 px) puis lancer `npm run icones` pour régénérer les icônes de la PWA.
- **Couleurs** : `tailwind.config.js`.
- **Contenu du questionnaire** : § 8.

---

## 13. Évolutions : changer de backend, connecteur Extrabat

- **Changer de backend** : toute la persistance distante passe par l'interface `DepotDistant` (`src/repository/distant.ts`). Pour remplacer Supabase (par exemple par un backend Node/Express), implémenter cette interface dans un nouvel adaptateur à côté de `src/repository/supabase/` et le brancher dans `src/repository/index.ts`. Le moteur de synchronisation et l'interface n'ont pas à changer.
- **Connecteur Extrabat (lecture seule)** : l'interface est prévue dans `src/repository/erp.ts` (`sourceProspectsErp`, `null` en V1, **non implémenté**). Elle permettra de pré-remplir les fiches prospects depuis l'ERP via son API, sans jamais y écrire.

---

## 14. Limites connues

- **Dictée vocale** (Web Speech API) : bien prise en charge sur Chrome/Android, mais elle nécessite en général du réseau (reconnaissance faite par le navigateur). Sur iOS/Safari, la prise en charge est partielle : l'application affiche alors un message invitant à utiliser le micro du clavier.
- **iOS** peut purger les données d'un site peu utilisé ; l'application demande un stockage persistant et la synchronisation limite le risque. Synchroniser régulièrement.
- Le **premier** lien magique nécessite du réseau.
- Les **photos supprimées** ne sont pas retirées du Storage Supabase (fichiers orphelins à purger manuellement).
- **Synchronisation** : résolution « dernière écriture gagne » ; le curseur de récupération a un risque marginal de manquer une transaction validée très tardivement (rattrapé à la modification suivante).
- **PDF** : police Helvetica standard (alphabet latin, accents français pris en charge ; les émojis sont retirés) et radar dessiné en SVG.
- **Versions de dépendances** : `@supabase/supabase-js` est épinglé en `2.118.0` (l'étiquette `latest` du registre npm pointait sur une version « canary » suspecte au moment de la construction). Vite 6, Tailwind 3 et TypeScript 5.9 sont volontairement conservés (versions stables éprouvées).
- **Non testé en conditions réelles** : le schéma SQL a été validé sur une base PostgreSQL locale (PGlite) et l'application via un parcours automatisé Playwright (mode local, hors ligne compris), mais **pas contre un vrai projet Supabase**, ni la fonction Edge (Deno), ni sur iOS. Prévoir une recette complète sur un projet de test avant la mise en production.
- Le champ `static_files` de `supabase/config.toml` (embarquement du prompt avec la fonction Edge) dépend de la version du CLI Supabase ; si le prompt n'est pas trouvé au déploiement, voir la documentation du CLI sur l'embarquement de fichiers statiques.

---

## 15. Commandes utiles

| Commande | Rôle |
|---|---|
| `npm run dev` | Serveur de développement |
| `npm run build` | Vérification des types + build de production (`dist/`) |
| `npm run preview` | Sert le build de production en local (test PWA / hors ligne) |
| `npm test` | Tests unitaires (moteur de scoring, parseur du référentiel, exports, dépôt local) |
| `npm run verifier-referentiel` | Valide uniquement le référentiel et le scoring |
| `npm run typecheck` | Vérification des types |
| `npm run icones` | Régénère les icônes PWA depuis `public/logo.png` |
