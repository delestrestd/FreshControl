# Tempo — serveur maison

Remplace Supabase : comptes, synchronisation des données et des photos, tout reste sur ce PC (`D:\TEMPO-SERVEUR\data`).
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

## Brancher le NAS (lake)
Dans `D:\TEMPO-SERVEUR\config.json`, mettre par exemple `"lakeDir": "\\\\GESSIANE\\tempo"`, puis redémarrer la tâche « Tempo serveur ».
Copie automatique chaque jour : base complète, une fiche JSON lisible par compte et par donnée, photos.

## Basculer l'appli sur ce serveur
Dans `index.html`, remplacer l'adresse Supabase de `SB_URL` par `https://sd.tail5b1899.ts.net`.
Pour essayer sur un seul appareil sans rien changer : `localStorage.setItem('fc_sync_srv','https://sd.tail5b1899.ts.net')`.

## Limite
Le PC doit rester allumé et connecté pour que les appareils se synchronisent. S'il est éteint,
l'appli continue de marcher hors ligne et envoie tout au retour du serveur.
