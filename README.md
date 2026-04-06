# 🥬 FreshControl

Application de gestion des produits périmés en supermarché, connectée au workflow N8N.

## Structure des fichiers

```
freshcontrol/
├── index.html      ← Application complète
├── manifest.json   ← Config PWA (app mobile installable)
├── vercel.json     ← Config déploiement Vercel
└── README.md
```

## Configuration N8N

Dans `index.html`, ligne 15, modifiez l'URL de votre webhook :
```javascript
const N8N_WEBHOOK = 'https://VOTRE-INSTANCE.app.n8n.cloud/webhook/scan-produit-magasin';
```

## Déploiement sur GitHub + Vercel

### Étape 1 — GitHub
1. Allez sur github.com → "New repository"
2. Nom : `freshcontrol`
3. Uploadez les 4 fichiers

### Étape 2 — Vercel
1. Allez sur vercel.com → "New Project"
2. Connectez votre GitHub
3. Sélectionnez le repo `freshcontrol`
4. Cliquez "Deploy"
5. Votre app est disponible sur `freshcontrol.vercel.app`

## Fonctionnalités

- **Tableau de bord** — 4 compteurs, filtres, liste produits, édition DLC
- **Scanner** — Photo → N8N → Gemini IA → Extraction automatique
- **Alertes** — Récap par magasin, connecté Gmail + Calendar
- **Planning** — Jours de visite par magasin

## Workflow N8N connecté

Photo envoyée → Webhook N8N → Gemini analyse → Google Sheets + Bubble → Gmail + Calendar

## PWA (app installable sur iPhone/Android)

Une fois déployé, ouvrez l'URL sur votre téléphone → "Ajouter à l'écran d'accueil"
