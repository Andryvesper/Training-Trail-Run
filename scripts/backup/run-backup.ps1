param(
    [switch]$SkipUpload
)

$ErrorActionPreference = 'Stop'

$repositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$backupDirectory = Join-Path $env:LOCALAPPDATA 'TrainingTrailRun\Backup'
$connectionPath = Join-Path $backupDirectory 'supabase-connection.dpapi'
$recipientPath = Join-Path $backupDirectory 'age-recipient.txt'
$rcloneLauncher = Join-Path $PSScriptRoot 'rclone.ps1'
$remoteDirectory = 'trainingtrailrun:TrainingTrailRun/backups'
$logPath = Join-Path $backupDirectory 'backup.log'
$runId = Get-Date -Format 'yyyyMMdd-HHmmss-fff'
$backupName = "TrainingTrailRun-$runId.zip.age"
$workDirectory = Join-Path $backupDirectory "work-$([guid]::NewGuid().ToString('N'))"
$payloadDirectory = Join-Path $workDirectory 'payload'
$dumpDirectory = Join-Path $payloadDirectory 'supabase'
$sourceDirectory = Join-Path $payloadDirectory 'source'
$manualsDirectory = Join-Path $payloadDirectory 'manuals'
$sourceArchive = Join-Path $workDirectory 'TrainingTrailRun.zip'
$encryptedArchive = Join-Path $workDirectory $backupName
$verificationDirectory = Join-Path $workDirectory 'verify'
$remoteArchive = "$remoteDirectory/$backupName"
$databasePassword = $null

function Write-BackupLog {
    param([string]$Message)
    $line = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $Message"
    Add-Content -LiteralPath $logPath -Value $line
    Write-Output $line
}

function Invoke-SupabaseDump {
    param(
        [string[]]$Arguments,
        [string]$OutputPath
    )

    $cliArguments = @(
        '--yes',
        'supabase@3.0.0',
        'db',
        'dump',
        "--remote=$script:remoteUri",
        '--file',
        $OutputPath,
        '--workdir',
        $script:repositoryRoot
    ) + $Arguments

    $originalPgPassword = [Environment]::GetEnvironmentVariable('PGPASSWORD', 'Process')
    try {
        $env:PGPASSWORD = $script:databasePassword
        & $script:npxPath @cliArguments
    } finally {
        if ($null -eq $originalPgPassword) {
            Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
        } else {
            $env:PGPASSWORD = $originalPgPassword
        }
    }

    if ($LASTEXITCODE -ne 0) {
        throw "Supabase CLI ha fallito l'export $OutputPath (codice $LASTEXITCODE)."
    }

    if (-not (Test-Path -LiteralPath $OutputPath) -or (Get-Item -LiteralPath $OutputPath).Length -eq 0) {
        throw "Il dump Supabase e vuoto o non e stato creato: $OutputPath"
    }
}

try {
    if (-not (Test-Path -LiteralPath $connectionPath)) {
        throw 'Connessione Supabase non configurata. Esegui configure-supabase-connection.ps1.'
    }
    if (-not (Test-Path -LiteralPath $recipientPath)) {
        throw 'Destinatario age non trovato. Esegui prepare-age-recovery-key.ps1.'
    }

    $encryptedConnection = Get-Content -LiteralPath $connectionPath -Raw
    $secureConnection = ConvertTo-SecureString $encryptedConnection
    $connectionPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureConnection)
    try {
        $connection = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($connectionPointer) | ConvertFrom-Json
    } finally {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($connectionPointer)
    }
    $databasePassword = $connection.password
    $remoteUri = 'postgresql://{0}@{1}:{2}/{3}?sslmode={4}' -f `
        [Uri]::EscapeDataString($connection.username), $connection.host, $connection.port,
        [Uri]::EscapeDataString($connection.database), $connection.sslmode
    $connection = $null

    $packageRoot = Join-Path $env:LOCALAPPDATA 'Microsoft\WinGet\Packages'
    $agePath = Get-ChildItem (Join-Path $packageRoot 'FiloSottile.age*') -Recurse -Filter age.exe |
        Select-Object -First 1 -ExpandProperty FullName
    if (-not $agePath) {
        throw 'age non trovato. Installa FiloSottile.age con winget.'
    }

    $npx = Get-Command npx.cmd -ErrorAction SilentlyContinue
    if (-not $npx) {
        throw 'npx.cmd non trovato. Installa Node.js e riapri la sessione.'
    }
    $npxPath = $npx.Source

    New-Item -ItemType Directory -Path $dumpDirectory, $sourceDirectory, $manualsDirectory -Force | Out-Null
    Write-BackupLog "Inizio backup $backupName."

    Invoke-SupabaseDump -Arguments @('--role-only') -OutputPath (Join-Path $dumpDirectory 'roles.sql')
    Invoke-SupabaseDump -Arguments @() -OutputPath (Join-Path $dumpDirectory 'schema.sql')
    Invoke-SupabaseDump -Arguments @(
        '--data-only',
        '--use-copy',
        '--exclude',
        'storage.buckets_vectors',
        '--exclude',
        'storage.vector_indexes'
    ) -OutputPath (Join-Path $dumpDirectory 'data.sql')

    $excludedDirectories = @('.git', '.vscode', '.temp', 'node_modules', '.vercel', '.next', 'coverage')
    $excludedFilePatterns = @('.env*', 'client_secret_*.json', '*.dpapi', '*.pem', '*.key', '~$*')
    $repositoryPrefix = $repositoryRoot.TrimEnd('\') + '\'
    foreach ($file in Get-ChildItem -LiteralPath $repositoryRoot -Force -Recurse -File) {
        $relativePath = $file.FullName.Substring($repositoryPrefix.Length)
        $segments = $relativePath -split '[\\/]'
        if ($segments | Where-Object { $_ -in $excludedDirectories }) {
            continue
        }
        if ($relativePath -like 'docs\manuali\*' -or $relativePath -like 'docs/manuali/*') {
            continue
        }
        if ($excludedFilePatterns | Where-Object { $file.Name -like $_ }) {
            continue
        }

        $destination = Join-Path $sourceDirectory $relativePath
        $destinationParent = Split-Path -Parent $destination
        New-Item -ItemType Directory -Path $destinationParent -Force | Out-Null
        Copy-Item -LiteralPath $file.FullName -Destination $destination
    }

    $bundlePath = Join-Path $payloadDirectory 'repository.bundle'
    & git -C $repositoryRoot bundle create $bundlePath --branches --tags
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $bundlePath)) {
        throw 'Creazione del bundle Git non riuscita.'
    }

    $manualsSource = Join-Path $repositoryRoot 'docs\manuali'
    if (Test-Path -LiteralPath $manualsSource) {
        $pdfs = Get-ChildItem -LiteralPath $manualsSource -File | Where-Object { $_.Extension -in @('.pdf', '.PDF') }
        foreach ($pdf in $pdfs) {
            Copy-Item -LiteralPath $pdf.FullName -Destination (Join-Path $manualsDirectory $pdf.Name)
        }
    }

    $manifestPath = Join-Path $payloadDirectory 'BACKUP-README.txt'
    @(
        "Training Trail Run backup created: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss K')",
        "Repository snapshot and Git bundle are included.",
        "Supabase roles, application schema, and data dumps are included.",
        "Supabase-managed auth and storage schemas/objects are not included by the Supabase CLI dump.",
        "Restore user identities separately; re-upload any Supabase Storage objects separately.",
        "Local PDF manuals present at backup time are included."
    ) | Set-Content -LiteralPath $manifestPath -Encoding UTF8

    Add-Type -AssemblyName System.IO.Compression.FileSystem
    [System.IO.Compression.ZipFile]::CreateFromDirectory(
        $payloadDirectory,
        $sourceArchive,
        [System.IO.Compression.CompressionLevel]::Optimal,
        $false
    )

    $recipient = (Get-Content -LiteralPath $recipientPath -Raw).Trim()
    if ($recipient -notmatch '^age1[0-9a-z]+$') {
        throw 'Il destinatario age non e valido.'
    }
    & $agePath -r $recipient -o $encryptedArchive $sourceArchive
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $encryptedArchive)) {
        throw 'Cifratura age non riuscita.'
    }

    $headerBuffer = New-Object byte[] 22
    $headerStream = [IO.File]::OpenRead($encryptedArchive)
    try {
        $headerBytesRead = $headerStream.Read($headerBuffer, 0, $headerBuffer.Length)
    } finally {
        $headerStream.Dispose()
    }
    if ($headerBytesRead -ne $headerBuffer.Length) {
        throw 'Il file cifrato e troppo corto per contenere un header age.'
    }
    $header = [Text.Encoding]::ASCII.GetString($headerBuffer)
    if (-not $header.StartsWith('age-encryption.org/v1')) {
        throw 'Il file cifrato non ha un header age valido.'
    }
    $encryptedHash = (Get-FileHash -LiteralPath $encryptedArchive -Algorithm SHA256).Hash
    Write-BackupLog "Archivio cifrato creato; SHA256=$encryptedHash; bytes=$((Get-Item $encryptedArchive).Length)."

    if (-not $SkipUpload) {
        & $rcloneLauncher mkdir $remoteDirectory
        & $rcloneLauncher copyto $encryptedArchive $remoteArchive
        New-Item -ItemType Directory -Path $verificationDirectory -Force | Out-Null
        Copy-Item -LiteralPath $encryptedArchive -Destination (Join-Path $verificationDirectory $backupName)
        & $rcloneLauncher check $verificationDirectory $remoteDirectory --one-way
        Write-BackupLog "Upload e verifica rclone riusciti: $remoteArchive."

        $remoteBackups = @(& $rcloneLauncher lsf $remoteDirectory --files-only |
            Where-Object { $_ -match '^TrainingTrailRun-\d{8}-\d{6}-\d{3}\.zip\.age$' } |
            Sort-Object -Descending)
        if ($remoteBackups.Count -gt 3) {
            foreach ($oldBackup in $remoteBackups | Select-Object -Skip 3) {
                & $rcloneLauncher deletefile "$remoteDirectory/$oldBackup"
                Write-BackupLog "Rimosso backup remoto più vecchio dopo verifica: $oldBackup."
            }
        }
        Write-BackupLog 'Backup completato e mantenute al massimo tre generazioni remote.'
    } else {
        Write-BackupLog 'Prova locale completata; upload e rotazione ignorati.'
    }
} catch {
    Write-BackupLog "ERRORE: $($_.Exception.Message)"
    throw
} finally {
    $databasePassword = $null
    if (Test-Path -LiteralPath $workDirectory) {
        Remove-Item -LiteralPath $workDirectory -Recurse -Force
    }
}
