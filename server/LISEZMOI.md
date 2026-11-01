# Tempo — serveur maison

Remplace Supabase et Vercel : l'appli, les comptes, la synchronisation des données et des photos, tout est servi par ce PC
(appli : `D:\TEMPO-SERVEUR\app`, données : `D:\TEMPO-SERVEUR\data`). Adresse : **https://sd.tail5b1899.ts.net**
Aucune dépendance : Node 24 suffit (SQLite intégré).

## Installer (une fois)
PowerShell, dans ce dossier :
```
.\installer.ps1 -AdminEmail sdelestre11@gmail.com -AdminPassword "VotreMotDePasse"
```
Le serveur démarre avec Windows et répond sur https://sd.tail5b1899.ts.net (Tailscale Funnel : HTTPS, aucun port ouvert sur la box).

## Gérer les accès
https://sd.tail5b1899.ts.net/admin : créer un compte, valider, bloquer, changer le rôle, nouveau mot de passe,
déconnecter les appareils, exporter ou supprimer les données d'un compte, journal des connexions.

## Mettre à jour l'appli servie
Après chaque modification de l'appli : `node server/publier-app.js` (copie les fichiers suivis par git, sans les données client).
Si `tempo-server.js` change : le recopier dans `D:\TEMPO-SERVEUR` et redémarrer la tâche « Tempo serveur ».

## Brancher le NAS (lake)
Dans `D:\TEMPO-SERVEUR\config.json`, renseigner `"lakeDir"` avec un dossier du NAS (ex. `"\\\\NAS_SDD\\TEMPO"`), puis redémarrer la tâche « Tempo serveur ».
Copie automatique chaque jour : base complète, une fiche JSON lisible par compte et par donnée, photos.

## Limite
Le PC doit rester allumé et connecté pour que les appareils se synchronisent. S'il est éteint,
l'appli déjà installée continue de marcher hors ligne et envoie tout au retour du serveur.
