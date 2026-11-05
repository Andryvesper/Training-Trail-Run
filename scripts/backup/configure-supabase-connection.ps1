$ErrorActionPreference = 'Stop'

$backupDirectory = Join-Path $env:LOCALAPPDATA 'TrainingTrailRun\Backup'
$connectionPath = Join-Path $backupDirectory 'supabase-connection.dpapi'
New-Item -ItemType Directory -Path $backupDirectory -Force | Out-Null

$connectionText = Read-Host 'URL PostgreSQL senza password (es. postgresql://postgres@db.<ref>.supabase.co:5432/postgres?sslmode=require)'
$connectionUri = $null
if (-not [Uri]::TryCreate($connectionText, [UriKind]::Absolute, [ref]$connectionUri) -or
    $connectionUri.Scheme -notin @('postgres', 'postgresql') -or
    -not $connectionUri.Host -or
    -not $connectionUri.UserInfo -or
    $connectionUri.UserInfo.Contains(':')) {
    throw 'URL non valido: serve un URL PostgreSQL senza password e con nome utente.'
}

$securePassword = Read-Host 'Password database Supabase (input nascosto)' -AsSecureString
if ($securePassword.Length -eq 0) {
    throw 'La password del database non puo essere vuota.'
}

$secretPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
try {
    $databasePassword = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($secretPointer)
} finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($secretPointer)
}

$payload = @{
    host = $connectionUri.Host
    port = if ($connectionUri.IsDefaultPort) { 5432 } else { $connectionUri.Port }
    username = [Uri]::UnescapeDataString($connectionUri.UserInfo)
    database = [Uri]::UnescapeDataString($connectionUri.AbsolutePath.TrimStart('/'))
    sslmode = 'require'
    password = $databasePassword
} | ConvertTo-Json -Compress

$protectedPayload = ConvertFrom-SecureString (ConvertTo-SecureString $payload -AsPlainText -Force)
[IO.File]::WriteAllText($connectionPath, $protectedPayload)
$databasePassword = $null
$payload = $null

Write-Output 'Connessione salvata localmente con DPAPI per il tuo utente Windows.'
