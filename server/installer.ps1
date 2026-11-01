# Tempo — installation du serveur maison sur ce PC (à lancer une fois, dans PowerShell)
#   1. copie le serveur dans D:\TEMPO-SERVEUR
#   2. crée le compte administrateur
#   3. démarrage automatique à l'ouverture de session Windows (tâche planifiée « Tempo serveur »)
#   4. adresse publique HTTPS via Tailscale Funnel : https://sd.tail5b1899.ts.net
param(
  [Parameter(Mandatory=$true)][string]$AdminEmail,
  [Parameter(Mandatory=$true)][string]$AdminPassword,
  [string]$LakeDir = ""
)
$ErrorActionPreference = 'Stop'
$dest = 'D:\TEMPO-SERVEUR'
New-Item -ItemType Directory -Force "$dest\data" | Out-Null
Copy-Item "$PSScriptRoot\tempo-server.js", "$PSScriptRoot\admin.html" $dest -Force
if (-not (Test-Path "$dest\config.json")) {
  $cfg = Get-Content "$PSScriptRoot\config.exemple.json" -Raw | ConvertFrom-Json
  $cfg.lakeDir = $LakeDir
  $cfg | ConvertTo-Json | Out-File "$dest\config.json" -Encoding utf8
}
$node = (Get-Command node).Source
& $node "$dest\tempo-server.js" --admin $AdminEmail $AdminPassword

# Démarrage automatique (relancé s'il s'arrête)
$action  = New-ScheduledTaskAction -Execute $node -Argument "`"$dest\tempo-server.js`"" -WorkingDirectory $dest
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$set     = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero)
Register-ScheduledTask -TaskName 'Tempo serveur' -Action $action -Trigger $trigger -Settings $set -Force | Out-Null
Start-ScheduledTask -TaskName 'Tempo serveur'

# Adresse publique HTTPS (Tailscale Funnel) ; la 1re fois, Tailscale peut afficher un lien pour l'autoriser
& 'C:\Program Files\Tailscale\tailscale.exe' funnel --bg 8787
Write-Host "`nServeur Tempo installé."
Write-Host "Administration : https://sd.tail5b1899.ts.net/admin  (ou http://localhost:8787/admin sur ce PC)"
