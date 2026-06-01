$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$logDir = Join-Path $root 'logs'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null

$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$logFile = Join-Path $logDir "questions-restante-slow-$stamp.log"

"Iniciando coleta conservadora em $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" | Tee-Object -FilePath $logFile
"Log: $logFile" | Tee-Object -FilePath $logFile -Append

npm run questions-restante-slow-prf -- --skip-comments *>&1 | Tee-Object -FilePath $logFile -Append
