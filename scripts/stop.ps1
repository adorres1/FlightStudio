$ErrorActionPreference = 'Stop'
try {
  $taskStatus = Invoke-RestMethod 'http://127.0.0.1:4187/api/status' -TimeoutSec 2
  if ($taskStatus.app -eq 'FlightStudioV2') {
    Invoke-RestMethod 'http://127.0.0.1:4187/api/shutdown' -Method Post -Headers @{ 'X-FlightStudio-Token' = $taskStatus.token } | Out-Null
    Write-Host 'FlightStudio beendet.'
  }
} catch { Write-Host 'FlightStudio laeuft nicht.' }
