# État du projet — note de reprise

> Dernière mise à jour : **2026-07-03**. Document de travail interne (état des lieux + reste à faire + pièges connus). À relire au début de chaque reprise.

## En un coup d'œil

| | |
|---|---|
| **Prod** | https://fresh-control.vercel.app |
| **Commit déployé** | `ade0c62` (merge PR #13) |
| **Branche** | `main` (non protégée sur GitHub) |
| **Stack** | `index.html` unique (HTML+CSS+JS inline), PWA, zero-build, Vercel |
| **Stockage** | `localStorage` (local-first) ; Google Apps Script + Sheets optionnels |
| **Compte** | `admin / admin` (mono-utilisateur) |
| **Projet Vercel** | `fresh-control` · team `team_3uCyXzGerxK4fGxScdn41DbW` |

## Ce qui fonctionne aujourd'hui

- **Scanner** (onglet 📷) : moteur `BarcodeEngine` — `BarcodeDetector` natif puis repli ZXing, caméra live continue, torche, repli photo pré-traité, validation clé EAN/UPC + anti-doublon.
- **Commande** (onglet 🛒) : **scan continu → ajout auto en colis** (PR #13). Voir README §« Module Commande ». Historique local, e-mail, export CSV.
- **Catalogue** : import Google Sheets (URL CSV) **et** import fichier local `.xlsx` / `.csv` (lecteur XLSX natif, zéro CDN). Onglet 📚 Catalogue en lecture seule (recherche instantanée).
- **Alertes DLC**, planning de tournées, rappels e-mail, multilingue FR/EN/ES/ZH.
- **Sécurité** : mots de passe PBKDF2-SHA-256 + sel, reset durci, `api/scan.js` désactivé par défaut (env `SCAN_TOKEN`).

## Reste à faire

- [ ] **Test caméra réel en magasin** (physique) — décodage d'un vrai code-barres sur HTTPS. Seul point non validable en headless. Si échec : vérifier autorisation caméra du navigateur + chargement de `BarcodeDetector`/ZXing (CSP autorise jsDelivr).
- [ ] **Gammes non-alimentaires Léa Nature** (cosmétique SO'BiO étic, Natessance, entretien…) : volontairement **hors périmètre** pour l'instant (décision 2026-07-02), à ajouter plus tard si besoin.
- [ ] Points d'audit **différés** (non bloquants) : sous-système GPS mort à nettoyer ; migration des `prompt()` mot de passe vers une modale stylée (capricieux en PWA iOS) ; relecture RGPD par juriste.

## Pièges connus (à ne pas réapprendre)

- **Déploiement Vercel — dédoublonnage d'arbre** : si un merge dans `main` ne produit **aucun** nouveau déploiement prod, c'est que Vercel a un arbre identique à une preview déjà buildée. Parade : un commit qui change réellement l'arbre force un build frais (cf `.vercelignore`, PR #11). Vérifier après chaque merge que la prod sert bien le nouveau code (`curl https://fresh-control.vercel.app | grep <marqueur>`).
- **Merge** : `main` n'est **pas** protégée sur GitHub ; le « garde-fou two-party » était le principe de confirmation de Claude, **levé pour ce projet** (autorisation permanente de merge accordée le 2026-07-03). Passer par PR reste la convention.
- **Cache hors-ligne (`sw.js`, depuis 2026-10-27)** : l'app s'ouvre depuis le cache du téléphone, puis la page demande au SW (message `fc-check`) si le serveur a une autre version → rechargement auto sur l'écran de connexion, bandeau « Mettre à jour » si une session est ouverte. Ne jamais remettre le SW en mode « cache sans revérification » (cause du blocage corrigé en `a5f892d`). **Secours** : si une mise à jour reste bloquée en prod, déployer un `sw.js` qui fait `self.registration.unregister()` + suppression des caches. La CSP `connect-src` doit autoriser jsDelivr et Google Fonts (le SW télécharge ZXing et les polices).
- **Données client jamais versionnées ni publiées** : `*.xlsx / *.xls / *.csv` sont dans `.gitignore` **et** `.vercelignore`.
- **Catalogues Léa Nature** (maj 2026-10-27) : voir `FreshControl_Catalogues/LISEZMOI.md` (local, non versionné). Base alimentaire = 876 produits (tarifs GMS 2026 + innos + avenant 12/10), dossier `NON_ALIMENTAIRE/` prêt. L'import `.xlsx` ne lit que la 1re feuille → le classeur combiné commence par `Tout_Alimentaire`.
- **Photos vrac** (depuis 2026-10-28) : rangées dans IndexedDB (`fc_media`), plus dans `localStorage` ; la fiche garde une référence `idb:<id>:sac|silo`. Incluses dans « Sauvegarder mes données » (clé `media`). Le cahier PDF charge jsPDF 2.5.1 à la demande (jsDelivr + SRI).
- **Micro** : `Permissions-Policy microphone=(self)` requis pour la dictée (Planning). Dictée = Web Speech API (réseau nécessaire sur Chrome) ; repli = micro du clavier.
- **Appareil déjà utilisé** : si `fc_users` existe déjà, le défaut `admin/admin` ne s'applique pas seul → « Réinitialiser les accès ».
- **Architecture** : auth + rôles 100 % côté client (`localStorage`) — pas une frontière de sécurité serveur. Assumé (direction local-first).

## Historique récent des PR

| PR | Objet | Commit merge |
|---|---|---|
| #13 | Commande : scan continu + quantité en colis | `ade0c62` |
| #12 | Onglet Catalogue (consultation lecture seule) | `246bcac` |
| #11 | `.vercelignore` + redéploiement prod | `e6644bf` |
| #10 | Import catalogue fichier `.xlsx` / `.csv` | `8753f66` |
| #9 | Moteur de scan robuste (natif + ZXing + live) | `e63563a` |
