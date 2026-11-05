$ErrorActionPreference = 'Stop'

$secretPath = Join-Path $env:LOCALAPPDATA 'TrainingTrailRun\Backup\rclone-config-password.dpapi'
$encryptedSecret = Get-Content -LiteralPath $secretPath -Raw
$secureSecret = ConvertTo-SecureString $encryptedSecret
$secretPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureSecret)

try {
    [Console]::Out.Write([Runtime.InteropServices.Marshal]::PtrToStringBSTR($secretPointer))
} finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($secretPointer)
}
