$ErrorActionPreference = 'Stop'

$clientId = Read-Host 'OAuth Client ID'
if (-not $clientId.Trim()) {
    throw 'Il Client ID non puo essere vuoto.'
}

$secureClientSecret = Read-Host 'OAuth Client Secret (input nascosto)' -AsSecureString
if ($secureClientSecret.Length -eq 0) {
    throw 'Il Client Secret non puo essere vuoto.'
}

$secretPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureClientSecret)
try {
    $clientSecret = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($secretPointer)
} finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($secretPointer)
}

$localBackup = Join-Path $env:LOCALAPPDATA 'TrainingTrailRun\Backup'
New-Item -ItemType Directory -Path $localBackup -Force | Out-Null
$oauthPath = Join-Path $localBackup 'drive-oauth.dpapi'
$payload = @{
    client_id = $clientId.Trim()
    client_secret = $clientSecret
} | ConvertTo-Json -Compress
$protectedPayload = ConvertFrom-SecureString (ConvertTo-SecureString $payload -AsPlainText -Force)
[IO.File]::WriteAllText($oauthPath, $protectedPayload)

$env:RCLONE_DRIVE_CLIENT_ID = $clientId.Trim()
$env:RCLONE_DRIVE_CLIENT_SECRET = $clientSecret
$rcloneLauncher = Join-Path $PSScriptRoot 'rclone.ps1'

try {
    & $rcloneLauncher config update trainingtrailrun scope drive.file
    if ($LASTEXITCODE -ne 0) {
        throw 'Impossibile aggiornare il permesso Drive.'
    }

    & $rcloneLauncher config reconnect trainingtrailrun:
    if ($LASTEXITCODE -ne 0) {
        throw 'La nuova autorizzazione Google non e riuscita.'
    }
} finally {
    Remove-Item Env:RCLONE_DRIVE_CLIENT_ID -ErrorAction SilentlyContinue
    Remove-Item Env:RCLONE_DRIVE_CLIENT_SECRET -ErrorAction SilentlyContinue
    $clientSecret = $null
    $payload = $null
}

Write-Output 'Client OAuth salvato localmente con DPAPI e ricollegato a Drive con scope drive.file.'
