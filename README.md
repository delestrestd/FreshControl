# FreshControl

PWA de gestion des produits périmés en supermarché.

- Scanner de code-barres EAN **100 % local** (ZXing dans le navigateur — pas d'API).
- Catalogue **multi-marques** synchronisé depuis Google Sheets.
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
admin / freshcontrol2024
```

**Changez ce mot de passe** depuis Admin → 🔑 Mon compte. L'identifiant `admin` est pré-rempli à l'écran de connexion.

Si l'accès est perdu, une réinitialisation est disponible depuis l'écran de connexion : code `RESET` + 4 premières lettres du nom du magasin (ou `RESET2024` si aucun magasin n'est configuré). La réinitialisation **ne restaure aucun identifiant connu** — elle demande de définir un nouveau mot de passe administrateur, haché immédiatement.

### Endpoint `api/scan.js` (analyse d'image — optionnel)

Désactivé par défaut. Il ne s'active que si la variable d'environnement `SCAN_TOKEN` est définie côté Vercel ; chaque requête doit alors présenter ce secret dans l'en-tête `x-fc-token`. Tant que `SCAN_TOKEN` n'est pas configuré, l'endpoint refuse tout appel (évite l'abus de la clé Anthropic). Optionnellement, `SCAN_ALLOWED_ORIGIN` restreint l'origine CORS.

## Licence

Privé — tous droits réservés.
