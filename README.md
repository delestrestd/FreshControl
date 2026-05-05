# FreshControl

PWA de gestion des produits périmés en supermarché.

- Scanner de code-barres EAN **100 % local** (ZXing dans le navigateur — pas d'API).
- Catalogue **multi-marques** synchronisé depuis Google Sheets.
- Alertes DLC, planning de tournées par magasin, rappels e-mail.
- Multi-utilisateurs : super admin, directeur, responsable, agent, lecture seule.
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

- Mots de passe hashés (SHA-256 + sel par utilisateur), migration douce des comptes existants au login.
- Échappement HTML systématique sur toutes les valeurs interpolées dans les rendus.
- Sub-Resource Integrity (SRI) verrouille la version de la CDN ZXing.
- Content-Security-Policy stricte, X-Frame-Options DENY, HSTS preload.
- Permissions-Policy : caméra et géolocalisation autorisées sur le même origin uniquement, micro / paiement / USB bloqués.

### Identifiants par défaut

À l'installation :

```
admin   / freshcontrol2024   (super-admin)
agent1  / agent123           (agent)
```

**Changer ces mots de passe immédiatement** depuis Admin → Utilisateurs. Si l'accès est perdu, un PIN de réinitialisation est disponible depuis l'écran de connexion (`RESET` + 4 premières lettres du nom du magasin, ou `RESET2024` si aucun magasin n'est configuré).

## Licence

Privé — tous droits réservés.
