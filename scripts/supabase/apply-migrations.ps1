# Applies the SQL files in supabase/migrations to the linked Supabase database,
# in filename order, each in its own transaction. Applied versions are recorded
# in app_migrations.applied, so later runs only apply new files.
# Uses the encrypted connection created by scripts/backup/configure-supabase-connection.ps1.
#
# Usage:
#   .\scripts\supabase\apply-migrations.ps1          # list pending migrations
#   .\scripts\supabase\apply-migrations.ps1 -Apply   # apply them
param(
    [switch]$Apply
)

$ErrorActionPreference = 'Stop'

$repositoryRoot = Resolve-Path (Join-Path $PSScriptRoot '..\..')
$migrationsDirectory = Join-Path $repositoryRoot 'supabase\migrations'
$connectionPath = Join-Path $env:LOCALAPPDATA 'TrainingTrailRun\Backup\supabase-connection.dpapi'
$psql = (Get-Command psql -ErrorAction SilentlyContinue).Source
if (-not $psql) { $psql = 'C:\Program Files\PostgreSQL\16\bin\psql.exe' }
if (-not (Test-Path -LiteralPath $psql)) { throw 'psql non trovato: installa il client PostgreSQL.' }
if (-not (Test-Path -LiteralPath $connectionPath)) {
    throw 'Connessione Supabase non configurata. Esegui scripts\backup\configure-supabase-connection.ps1.'
}

$secureConnection = ConvertTo-SecureString (Get-Content -LiteralPath $connectionPath -Raw)
$pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureConnection)
try {
    $connection = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer) | ConvertFrom-Json
} finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
}

$arguments = @(
    '-h', $connection.host, '-p', $connection.port,
    '-U', $connection.username, '-d', $connection.database,
    '-v', 'ON_ERROR_STOP=1', '-X', '-q'
)

function Invoke-Psql {
    param([string[]]$Extra)
    & $psql @arguments @Extra
    if ($LASTEXITCODE -ne 0) { throw "psql terminato con codice $LASTEXITCODE." }
}

$env:PGPASSWORD = $connection.password
$env:PGSSLMODE = 'require'
$connection = $null
try {
    Invoke-Psql @('-c', 'create schema if not exists app_migrations; create table if not exists app_migrations.applied (version text primary key, applied_at timestamptz not null default now()); revoke all on schema app_migrations from public;')
    $applied = @(& $psql @arguments '-t' '-A' '-c' 'select version from app_migrations.applied order by version')
    if ($LASTEXITCODE -ne 0) { throw 'Impossibile leggere le migrazioni applicate.' }

    $pending = Get-ChildItem -LiteralPath $migrationsDirectory -Filter '*.sql' |
        Sort-Object Name |
        Where-Object { $applied -notcontains $_.BaseName }

    if (-not $pending) {
        Write-Host 'Nessuna migrazione da applicare.'
        return
    }
    Write-Host 'Migrazioni da applicare:'
    $pending | ForEach-Object { Write-Host "  $($_.Name)" }
    if (-not $Apply) {
        Write-Host 'Riesegui con -Apply per applicarle.'
        return
    }

    foreach ($migration in $pending) {
        Write-Host "Applico $($migration.Name)..."
        $wrapper = [IO.Path]::GetTempFileName()
        try {
            $escapedPath = $migration.FullName.Replace('\', '/').Replace("'", "''")
            $version = $migration.BaseName.Replace("'", "''")
            # UTF-8 senza BOM: psql non riconosce un comando preceduto dal BOM.
            [IO.File]::WriteAllLines($wrapper, [string[]]@(
                "\i '$escapedPath'",
                "insert into app_migrations.applied (version) values ('$version') on conflict do nothing;"
            ), (New-Object Text.UTF8Encoding($false)))
            Invoke-Psql @('--single-transaction', '-f', $wrapper)
        } finally {
            Remove-Item -LiteralPath $wrapper -ErrorAction SilentlyContinue
        }
    }
    Write-Host 'Migrazioni applicate.'
} finally {
    Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
}
