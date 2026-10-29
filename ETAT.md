# État du projet — note de reprise

> Dernière mise à jour : **2026-10-29**. Document de travail interne (état des lieux + reste à faire + pièges connus). À relire au début de chaque reprise.

## En un coup d'œil

| | |
|---|---|
| **Application** | **Tempo** (renommée le 2026-10-28) — outil terrain GMS de S2D COMMERCIAL ; le module des dates garde le nom « Fresh Control » |
| **Prod** | https://fresh-control.vercel.app |
| **Commit déployé** | `6d86f14` (merge PR #48) |
| **Branche** | `main` (non protégée sur GitHub) |
| **Stack** | `index.html` unique (HTML+CSS+JS inline), PWA, zero-build, Vercel |
| **Stockage** | `localStorage` (données) + IndexedDB `fc_media` (photos) ; tout reste sur le téléphone |
| **Compte** | `admin / admin` (mono-utilisateur, comptes serveur prévus plus tard) |
| **Projet Vercel** | `fresh-control` · team `team_3uCyXzGerxK4fGxScdn41DbW` |

## Ce qui fonctionne aujourd'hui

- **Accueil 4 icônes** : Fresh (dates), Gestion, Planning, Alertes ; pastille magasin détecté par GPS ; actualités dans les cartes.
- **Fresh** : scan des dates (DLC), alertes, démarque (bouton ♻, onglet Démarque), bon de reprise PDF.
- **Commande / pré-commande** : scan continu, navigateur par marque, mode rupture, contrôle du prix (prix chargés localement), bon PDF à codes-barres + Excel.
- **Catalogue intégré** : 1 272 produits (876 alimentaire + 396 non-alimentaire), rangés univers → marque → gamme ; 14 logos de marques (`brand/marques/`).
- **OCR** (Tesseract.js 5.1.1, local) : 🔢 lecture des chiffres d'une étiquette prix ; **lecture de l'étiquette du sac vrac** (lot, DDM, origine, EAN remplis automatiquement, cases surlignées).
- **Vrac** : fiche de mise en rayon (2 photos sac/silo, hygiène 9 points), **brouillon sauvegardé en continu et restauré après rechargement**, cahier virtuel par produit (ouvert après chaque enregistrement), historique, cahier / fiche PDF.
- **Planning** : semaine, comptes-rendus dictés, photos avant/après, fiche magasin (contacts, jours de commande / livraison).
- **Statistiques** complètes, bandeau Gestion 30 j, écran Par marque.
- **Documents** : chaque type a sa couleur de bandeau + liseré (commande vert, pré-commande bleu, reprise rouge, vrac marron, stock violet, produits à retirer orange, ruptures ardoise) et **tous les documents listant des produits portent le vrai code-barres EAN dessiné** (module `Ean`, `buildListPdf`).
- **Langues** FR/EN/ES/ZH (dictionnaire `TRD`) ; textes juridiques restés en français.
- **Sécurité** : mots de passe PBKDF2-SHA-256 + sel, CSP stricte (jsDelivr seul CDN script), `api/scan.js` désactivé par défaut.

## Reste à faire

- [ ] **Tests terrain par Stéphane** : fiche vrac sur un vrai sac (lecture de l'étiquette, sauvegarde), dictée réelle, OCR sur étiquette électronique, partage PDF/Excel, douchette sur bon imprimé à 100 %.
- [ ] **Assortiment + taux de présence** : il faut la liste de base (plans de vente PDF ou liste par magasin).
- [ ] **Modes iPad / PC** (Réglages › Affichage, téléphone par défaut).
- [ ] **Avec serveur** (Supabase UE proposé) : gestion des utilisateurs (4 rôles, validée), rapport de la semaine, reformulation de la dictée.
- [ ] Traduction des mentions légales / charte RGPD (à faire à part, relecture juriste).
- [ ] Logo Biothentic (si fourni ; affiché en toutes lettres en attendant).
- [ ] Avertissement console bénin au démarrage : `[Catalogue] Seed echec … catalogueRefIdx before initialization` (le catalogue se charge quand même au 2e essai) — à nettoyer.

## Pièges connus (à ne pas réapprendre)

- **Toujours vérifier la syntaxe avant de publier** : un retour à la ligne littéral dans une chaîne JS (PR #47) a empêché tout le script de se charger → connexion impossible en prod pendant quelques minutes (corrigé PR #48). Contrôle : extraire chaque `<script>` inline et le passer à `node --check`, puis, après déploiement, se connecter réellement sur la prod (pas seulement `grep`).
- **Ne pas écrire de `\n` via un script Python lancé dans un heredoc bash** : l'échappement peut produire un vrai saut de ligne. Préférer `/\n/` (regex) ou l'outil Edit.
- **Scan live** : `BarcodeEngine.startLiveScan` détecte en continu. Tout écran qui ouvre une fiche après lecture doit arrêter le scan (sinon la fiche est rouverte à zéro à chaque relecture — cause des fiches vrac perdues, corrigé PR #47).
- **IndexedDB** : chaque opération `MediaDB` a un délai maximal de 6 s (certains iPhone ne répondent jamais à l'ouverture).
- **Déploiement Vercel — dédoublonnage d'arbre** : si un merge dans `main` ne produit aucun nouveau déploiement prod, Vercel a un arbre identique à une preview. Parade : un commit qui change réellement l'arbre (cf `.vercelignore`, PR #11).
- **Merge** : `main` n'est pas protégée ; autorisation permanente de merge pour ce projet (2026-07-03), mais on ne met en ligne que quand Stéphane le demande. Passer par PR reste la convention.
- **Cache hors-ligne (`sw.js`)** : page servie depuis le cache puis revérifiée (message `fc-check`) → rechargement auto sur la connexion, bandeau « Mettre à jour » si session ouverte. Ne jamais repasser en « cache sans revérification » (cf `a5f892d`). Secours : `sw.js` qui fait `self.registration.unregister()` + vide les caches. Un téléphone qui a chargé une version cassée se répare en fermant / rouvrant l'appli.
- **Données client jamais versionnées ni publiées** : `*.xlsx / *.xls / *.csv / *.pdf` et `FreshControl_Catalogues/` sont dans `.gitignore` et `.vercelignore`.
- **Les prix ne sont jamais dans l'appli publiée** : chargés sur le téléphone via Réglages › Charger les prix (`fc_prices`, fichier `Tempo_Prix_a_charger.csv`).
- **Catalogues** : voir `FreshControl_Catalogues/LISEZMOI.md` (local). Seed intégré généré par `FreshControl_Catalogues/_outils/build_seed_app.py` (`SEED_TSV`, 9 colonnes).
- **CSP** : `script-src` inclut `'wasm-unsafe-eval'` et `worker-src 'self' blob:` (Tesseract) ; `connect-src` autorise jsDelivr (données de langue OCR, ZXing, jsPDF).
- **Micro** : `Permissions-Policy microphone=(self)` requis pour la dictée.
- **Appareil déjà utilisé** : si `fc_users` existe, le défaut `admin/admin` ne s'applique pas → « Réinitialiser les accès ».
- **Architecture** : auth + rôles côté client — pas une frontière de sécurité serveur. Assumé (local-first) jusqu'au passage au serveur.

## Historique récent des PR

| PR | Objet | Commit merge |
|---|---|---|
| #48 | Hotfix : saut de ligne qui cassait le script | `6d86f14` |
| #47 | Vrac sans perte (scan stoppé, brouillon), lecture de l'étiquette, codes-barres + couleurs sur tous les documents | `a56ca60` |
| #46 | Statistiques complètes, Gestion 30 j, Par marque, logos Jom Bao / Gusti Amo | `e26a3b2` |
| #45 | Démarque chiffrée, bon de reprise, logos des marques | `8cb6e76` |
| #44 | Rupture, contrôle du prix, pré-commande, fiche magasin, traductions | `e086de2` |
| #43 | Tempo, catalogue non-alimentaire, navigateur par marque, OCR | `7d0ab10` |
| #42 | Bon PDF à codes-barres, cahier vrac virtuel | `ee3e930` |
| #41 | E-mails au même gabarit, Gestion décrite | `8c86a0a` |
| #40 | Accueil 4 icônes, vrac, Planning | `1e20ff1` |
