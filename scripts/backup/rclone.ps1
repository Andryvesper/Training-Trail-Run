param(
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$RcloneArguments
)

$ErrorActionPreference = 'Stop'
$packageRoot = Join-Path $env:LOCALAPPDATA 'Microsoft\WinGet\Packages'
$rclonePath = Get-ChildItem (Join-Path $packageRoot 'Rclone.Rclone*') -Recurse -Filter rclone.exe |
    Select-Object -First 1 -ExpandProperty FullName

if (-not $rclonePath) {
    throw 'rclone non e installato. Installa Rclone.Rclone con winget.'
}

$passwordScript = Join-Path $PSScriptRoot 'rclone-config-password.ps1'
$passwordCommand = "powershell.exe -NoProfile -ExecutionPolicy Bypass -File `"$passwordScript`""
$oauthPath = Join-Path $env:LOCALAPPDATA 'TrainingTrailRun\Backup\drive-oauth.dpapi'

if (Test-Path -LiteralPath $oauthPath) {
    $secureOAuth = ConvertTo-SecureString (Get-Content -LiteralPath $oauthPath -Raw)
    $oauthPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureOAuth)
    try {
        $oauth = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($oauthPointer) | ConvertFrom-Json
        $env:RCLONE_DRIVE_CLIENT_ID = $oauth.client_id
        $env:RCLONE_DRIVE_CLIENT_SECRET = $oauth.client_secret
    } finally {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($oauthPointer)
    }
}

& $rclonePath "--password-command=$passwordCommand" @RcloneArguments
if ($LASTEXITCODE -ne 0) {
    throw "rclone e terminato con codice $LASTEXITCODE."
}
