$ErrorActionPreference = 'Stop'

$backupScript = Join-Path $PSScriptRoot 'run-backup.ps1'
if (-not (Test-Path -LiteralPath $backupScript)) {
    throw "Script di backup non trovato: $backupScript"
}

$powershell = Join-Path $PSHOME 'powershell.exe'
$action = New-ScheduledTaskAction `
    -Execute $powershell `
    -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$backupScript`""
$trigger = New-ScheduledTaskTrigger -Daily -At '7:00AM'
$principal = New-ScheduledTaskPrincipal `
    -UserId ([System.Security.Principal.WindowsIdentity]::GetCurrent().Name) `
    -LogonType Interactive `
    -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet `
    -StartWhenAvailable `
    -ExecutionTimeLimit (New-TimeSpan -Hours 2) `
    -MultipleInstances IgnoreNew

Register-ScheduledTask `
    -TaskName 'TrainingTrailRun-EncryptedBackup' `
    -Action $action `
    -Trigger $trigger `
    -Principal $principal `
    -Settings $settings `
    -Description 'Crea, cifra, verifica e ruota i backup Supabase e repository su Google Drive.' `
    -Force | Out-Null

Write-Output "Attivita giornaliera registrata per le 07:00. Richiede la sessione Windows dell'utente per DPAPI e OAuth."
