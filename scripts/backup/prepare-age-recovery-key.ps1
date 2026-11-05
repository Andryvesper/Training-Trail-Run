$ErrorActionPreference = 'Stop'

$packageRoot = Join-Path $env:LOCALAPPDATA 'Microsoft\WinGet\Packages'
$ageKeygen = Get-ChildItem $packageRoot -Directory -Filter 'FiloSottile.age*' |
    ForEach-Object { Get-ChildItem $_.FullName -Recurse -Filter age-keygen.exe } |
    Select-Object -First 1 -ExpandProperty FullName

if (-not $ageKeygen) {
    throw 'age-keygen non e installato. Installa FiloSottile.age con winget.'
}

$backupDirectory = Join-Path $env:LOCALAPPDATA 'TrainingTrailRun\Backup'
$privateKeyPath = Join-Path $backupDirectory 'age-recovery-key.txt'
$recipientPath = Join-Path $backupDirectory 'age-recipient.txt'

if ((Test-Path -LiteralPath $privateKeyPath) -or (Test-Path -LiteralPath $recipientPath)) {
    throw 'Esiste gia una chiave age. Non verra sovrascritta.'
}

New-Item -ItemType Directory -Path $backupDirectory -Force | Out-Null
$acl = Get-Acl -LiteralPath $backupDirectory
if (-not $acl.AreAccessRulesProtected) {
    throw "La cartella $backupDirectory non ha ACL protette. Proteggila prima di generare la chiave."
}

$allowedIdentities = @(
    [System.Security.Principal.WindowsIdentity]::GetCurrent().Name,
    'NT AUTHORITY\SYSTEM',
    'BUILTIN\Administrators'
)
foreach ($allowedIdentity in $allowedIdentities) {
    $hasFullControl = $acl.Access | Where-Object {
        $_.IdentityReference.Value -eq $allowedIdentity -and
        $_.FileSystemRights.ToString() -match 'FullControl' -and
        $_.AccessControlType -eq [System.Security.AccessControl.AccessControlType]::Allow
    }
    if (-not $hasFullControl) {
        throw "ACL non sicura: $allowedIdentity deve avere accesso completo alla cartella di backup."
    }
}

& $ageKeygen -o $privateKeyPath
if ($LASTEXITCODE -ne 0) {
    throw 'La generazione della chiave age non e riuscita.'
}

$publicKey = Select-String -LiteralPath $privateKeyPath -Pattern '^# public key: (age1\S+)$'
if (-not $publicKey) {
    Remove-Item -LiteralPath $privateKeyPath -Force
    throw 'La chiave generata non contiene un destinatario age valido.'
}

Set-Content -LiteralPath $recipientPath -Value $publicKey.Matches[0].Groups[1].Value -NoNewline
Write-Output 'Chiave di recupero creata. Copiala dal file indicato nel password manager, senza condividerla.'
Write-Output "File temporaneo della chiave privata: $privateKeyPath"
Write-Output "Destinatario age (non segreto): $recipientPath"
