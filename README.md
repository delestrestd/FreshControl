# FreshControl

PWA de gestion des produits périmés en supermarché.

- Scanner de code-barres EAN **robuste et 100 % local** : `BarcodeDetector` natif (Android Chrome) avec repli **ZXing** (iOS/Safari), caméra **live en continu**, torche + autofocus, repli photo — aucune image n'est envoyée à un serveur.
- **Module Commande** : réappro par **scan continu** — chaque produit reconnu s'ajoute tout seul, quantités exprimées en **colis**, e-mail + historique local (voir plus bas).
- Catalogue **multi-marques** synchronisé depuis Google Sheets **ou importé localement** (`.xlsx` / `.csv`, sans dépendance CDN ni envoi serveur).
- Onglet **Catalogue** : consultation en lecture seule du catalogue agrégé (recherche instantanée nom / gencod / type / marque).
- Alertes DLC, planning de tournées par magasin, rappels e-mail.
- Mono-utilisateur : un seul compte administrateur (outil de terrain personnel).
- Multilingue (FR / EN / ES / ZH).

## Démarrage rapide

```bash
# Servir l'app en local (Node 18+)
npm run dev          # http://localhost:3000

# Valider la config
npm run validate     # JSON + HTML
```

Tout l'état (utilisateurs, produits, catalogue) est stocké en `localStorage`. Aucune base requise.

## Déploiement

```
Push sur GitHub → Vercel détecte le repo → deploy automatique.
```

`vercel.json` configure les en-têtes de sécurité (CSP, HSTS, X-Frame-Options, Permissions-Policy) et le cache.

## Structure

```
freshcontrol/
├── index.html        ← Application complète (HTML + CSS + JS inline, PWA)
├── manifest.json     ← Manifeste PWA (icônes SVG, scope, display, etc.)
├── vercel.json       ← Headers de sécurité + cache
├── package.json      ← Métadonnées + scripts
├── api/
│   └── scan.js       ← Endpoint serverless Vercel (Claude Vision pour
│                       l'analyse d'image — optionnel, non requis par le
│                       front-end actuel qui utilise saisie manuelle)
└── icons/            ← Icônes PWA (SVG self-hosted)
```

## Configuration

L'app se configure entièrement depuis l'écran **Admin** une fois connecté :

| Champ | Description |
|---|---|
| Nom du magasin | Affiché dans le header |
| URL Google Sheet (CSV) | Catalogue produits (multi-onglets supportés) |
| URL Google Apps Script | Backup des scans + envoi e-mail (optionnel) |

### Format du Google Sheet

Une ligne d'en-tête, puis les produits. Colonnes minimales :

```
gencod        Libellé produit            Famille
3456300020694 Yaourt nature bio 125g     Crémerie
```

Synonymes acceptés pour les en-têtes : `gencod` / `ean` / `code`, `libellé` / `nom` / `produit`, `famille` / `type` / `rayon`.

URL CSV publique : `https://docs.google.com/spreadsheets/d/<ID>/gviz/tq?tqx=out:csv&sheet=<NomOnglet>`

Plusieurs onglets / marques peuvent être combinés via `|` :

```
https://…/gviz/tq?tqx=out:csv&sheet=Marque_A|https://…/gviz/tq?tqx=out:csv&sheet=Marque_B
```

### Import d'un catalogue par fichier (local-first)

Depuis Admin → 📋 Marques → **« Importer un fichier »**, on charge un tarif au format `.xlsx` ou `.csv` directement dans le navigateur (lecteur XLSX natif, zéro dépendance externe, aucun envoi serveur). Les colonnes reconnues sont les mêmes que pour Google Sheets (`Code-barres / Gencod`, `Nom du produit`, `Type` — synonymes tolérés). Une marque importée par fichier porte l'icône 📁 : ses produits sont **préservés à chaque synchro** et ne sont remplacés que par un ré-import.

> Les fichiers `.xlsx / .xls / .csv` du dépôt sont exclus du versionnement (`.gitignore`) **et** du déploiement (`.vercelignore`) : ce sont des données métier client, jamais publiées.

## Module Commande (réappro par scan)

Onglet 🛒 **Commande** — 100 % local, aucune commande n'est poussée vers un serveur (enregistrement `localStorage` + e-mail pré-rempli).

**Fonctionnement du scan (depuis la v3.1) :**

1. Un appui unique sur **« 📷 Démarrer le scan »** allume la caméra, qui tourne ensuite **en continu**.
2. Dès qu'un code-barres est **reconnu dans le catalogue**, la ligne s'ajoute **automatiquement** à la commande (1 colis) — aucune photo à déclencher, aucune boîte à valider. Un flash vert + un toast confirment l'ajout.
3. Re-scanner le même produit **incrémente** son nombre de colis (anti-doublon de 2 s pour éviter les comptages accidentels).
4. La quantité de chaque ligne est un **nombre de colis** librement ajustable (`− / +` ou saisie directe). *Le fichier tarif ne contenant pas le conditionnement (unités par colis), aucune conversion en unités n'est faite.*
5. Un code **hors catalogue** (ou la saisie manuelle) ouvre une boîte pour renseigner le nom du produit avant l'ajout.

La commande se valide par e-mail ; un **historique local** permet de recharger, renvoyer ou exporter (CSV, colonne `colis`) les commandes passées.

> La caméra ne démarre pas d'elle-même à l'ouverture de l'onglet : le clic initial sur « Démarrer le scan » reste nécessaire (choix délibéré pour ne pas monopoliser la caméra).

## Sécurité

- Mots de passe hachés **PBKDF2-SHA-256 (200 000 itérations) + sel par utilisateur** ; migration automatique au login des anciens formats (clair / SHA-256 simple).
- ⚠️ **Limite d'architecture** : toute l'authentification et les rôles sont côté client (`localStorage`). Ce n'est **pas** une frontière de sécurité opposable à un utilisateur ayant accès au navigateur/devtools — c'est un garde-fou d'usage, pas un contrôle d'accès serveur.
- Échappement HTML systématique sur toutes les valeurs interpolées dans les rendus.
- Sub-Resource Integrity (SRI) verrouille la version de la CDN ZXing.
- Content-Security-Policy stricte, X-Frame-Options DENY, HSTS preload.
- Permissions-Policy : caméra et géolocalisation autorisées sur le même origin uniquement, micro / paiement / USB bloqués.

### Identifiant par défaut (application mono-utilisateur)

À l'installation, un **unique compte** est créé :

```
admin / admin
```

L'identifiant `admin` est pré-rempli à l'écran de connexion. Vous pouvez changer le mot de passe depuis Admin → 🔑 Mon compte (il est alors haché en PBKDF2 au login).

Si l'accès est perdu, le bouton « Réinitialiser les accès » de l'écran de connexion **restaure simplement `admin / admin`** (les produits, le catalogue et la configuration sont conservés).

### Endpoint `api/scan.js` (analyse d'image — optionnel)

Désactivé par défaut. Il ne s'active que si la variable d'environnement `SCAN_TOKEN` est définie côté Vercel ; chaque requête doit alors présenter ce secret dans l'en-tête `x-fc-token`. Tant que `SCAN_TOKEN` n'est pas configuré, l'endpoint refuse tout appel (évite l'abus de la clé Anthropic). Optionnellement, `SCAN_ALLOWED_ORIGIN` restreint l'origine CORS.

## Licence

Privé — tous droits réservés.
