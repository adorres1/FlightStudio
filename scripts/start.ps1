param([switch]$NoBrowser)
$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path -Parent $PSScriptRoot
$taskUrl = 'http://127.0.0.1:4187'
try { $taskStatus = Invoke-RestMethod "$taskUrl/api/status" -TimeoutSec 2 } catch { $taskStatus = $null }
if ($taskStatus -and $taskStatus.app -ne 'FlightStudioV2') { throw 'Port 4187 wird bereits von einer anderen Anwendung verwendet.' }
if (-not $taskStatus) {
  $taskNode = Join-Path $taskRoot 'runtime\node.exe'
  if (-not (Test-Path -LiteralPath $taskNode)) {
    $taskCommand = Get-Command node.exe -ErrorAction SilentlyContinue
    if (-not $taskCommand) { throw 'Node.js fehlt. Bitte die portable Version mit runtime\node.exe verwenden oder Node.js 22+ von nodejs.org installieren.' }
    $taskNode = $taskCommand.Source
  }
  if (-not (Test-Path -LiteralPath (Join-Path $taskRoot 'node_modules\cesium'))) { throw 'Bibliotheken fehlen. Bitte zuerst npm install im Programmordner ausfuehren oder die portable ZIP verwenden.' }
  $taskLogDir = Join-Path $taskRoot 'data'
  New-Item -ItemType Directory -Force -Path $taskLogDir | Out-Null
  $taskServer = Join-Path $taskRoot 'server.mjs'
  Start-Process -FilePath $taskNode -ArgumentList ('"' + $taskServer + '"') -WorkingDirectory $taskRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $taskLogDir 'server.log') -RedirectStandardError (Join-Path $taskLogDir 'server-error.log')
  for ($taskAttempt = 0; $taskAttempt -lt 40; $taskAttempt++) {
    Start-Sleep -Milliseconds 250
    try { $taskStatus = Invoke-RestMethod "$taskUrl/api/status" -TimeoutSec 1; break } catch { }
  }
  if (-not $taskStatus) { throw 'FlightStudio konnte nicht starten. Siehe data\server-error.log.' }
}
if (-not $NoBrowser) { Start-Process $taskUrl }
