$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path -Parent $PSScriptRoot
$taskNode = (Get-Command node.exe -ErrorAction Stop).Source
$taskArch = & $taskNode -p 'process.arch'
if ($taskArch -ne 'x64') { throw 'Dieser Paketbau erwartet Windows x64.' }
$taskVersion = & $taskNode -p 'process.version'
$taskRelease = Join-Path $taskRoot 'release'
$taskStamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$taskBuild = Join-Path $taskRelease ('build-' + $taskStamp)
$taskPortable = Join-Path $taskBuild 'FlightStudio-V2-Windows-x64'
$taskSource = Join-Path $taskBuild 'FlightStudio-V2-Source'
New-Item -ItemType Directory -Force -Path $taskPortable,$taskSource | Out-Null
$taskFiles = @('server.mjs','package.json','package-lock.json','README.md','LICENSE','THIRD-PARTY-NOTICES.txt','.gitignore','.gitattributes','START-FlightStudio-Desktop.cmd','START-FlightStudio-V2.cmd','STOP-FlightStudio-V2.cmd')
$taskDirs = @('public','lib','desktop','scripts','tests','docs')
foreach ($taskDestination in @($taskPortable,$taskSource)) {
  foreach ($taskName in $taskFiles) { Copy-Item -LiteralPath (Join-Path $taskRoot $taskName) -Destination $taskDestination }
  foreach ($taskName in $taskDirs) { Copy-Item -LiteralPath (Join-Path $taskRoot $taskName) -Destination $taskDestination -Recurse }
}
Write-Host 'Programmbibliotheken werden kopiert ...'
$taskModules = Join-Path $taskRoot 'node_modules'
foreach ($taskFile in Get-ChildItem -LiteralPath $taskModules -Recurse -File) {
  $taskRelative = $taskFile.FullName.Substring($taskModules.Length + 1)
  if ($taskRelative -match '^ffprobe-static\\bin\\(darwin|linux)\\' -or $taskRelative -match '^ffprobe-static\\bin\\win32\\ia32\\' -or $taskRelative -match '^cesium\\(Source|Apps|Documentation|Specs)\\' -or $taskRelative -match '^cesium\\Build\\CesiumUnminified\\' -or $taskRelative -match '^\.cache\\') { continue }
  $taskTarget = Join-Path (Join-Path $taskPortable 'node_modules') $taskRelative
  $taskParent = Split-Path -Parent $taskTarget
  if (-not (Test-Path -LiteralPath $taskParent)) { New-Item -ItemType Directory -Force -Path $taskParent | Out-Null }
  Copy-Item -LiteralPath $taskFile.FullName -Destination $taskTarget
}
$taskRuntime = Join-Path $taskPortable 'runtime'
New-Item -ItemType Directory -Force -Path $taskRuntime | Out-Null
Copy-Item -LiteralPath $taskNode -Destination (Join-Path $taskRuntime 'node.exe')
Invoke-WebRequest -Uri "https://raw.githubusercontent.com/nodejs/node/$taskVersion/LICENSE" -OutFile (Join-Path $taskRuntime 'NODE-LICENSE.txt')
function Write-BinaryNotice([string]$taskBinary,[string]$taskNotice) {
  $taskInfo = New-Object System.Diagnostics.ProcessStartInfo
  $taskInfo.FileName = $taskBinary
  $taskInfo.Arguments = '-L'
  $taskInfo.UseShellExecute = $false
  $taskInfo.CreateNoWindow = $true
  $taskInfo.RedirectStandardOutput = $true
  $taskInfo.RedirectStandardError = $true
  $taskProcess = New-Object System.Diagnostics.Process
  $taskProcess.StartInfo = $taskInfo
  $null = $taskProcess.Start()
  $taskStdout = $taskProcess.StandardOutput.ReadToEndAsync()
  $taskStderr = $taskProcess.StandardError.ReadToEndAsync()
  $taskProcess.WaitForExit()
  if ($taskProcess.ExitCode -ne 0) { throw 'Lizenzinformationen der Medienwerkzeuge konnten nicht gelesen werden.' }
  [IO.File]::WriteAllText($taskNotice,$taskStdout.Result + $taskStderr.Result,[Text.UTF8Encoding]::new($false))
  $taskProcess.Dispose()
}
Write-BinaryNotice (Join-Path $taskPortable 'node_modules\ffmpeg-static\ffmpeg.exe') (Join-Path $taskPortable 'FFMPEG-LICENSE-NOTICE.txt')
Write-BinaryNotice (Join-Path $taskPortable 'node_modules\ffprobe-static\bin\win32\x64\ffprobe.exe') (Join-Path $taskPortable 'FFPROBE-LICENSE-NOTICE.txt')
Add-Type -AssemblyName System.IO.Compression.FileSystem
$taskZip = Join-Path $taskRelease 'FlightStudio-V2-Windows-x64.zip'
$taskSourceZip = Join-Path $taskRelease 'FlightStudio-V2-Source.zip'
if (Test-Path -LiteralPath $taskZip) { $taskZip = Join-Path $taskRelease ('FlightStudio-V2-Windows-x64-' + $taskStamp + '.zip') }
if (Test-Path -LiteralPath $taskSourceZip) { $taskSourceZip = Join-Path $taskRelease ('FlightStudio-V2-Source-' + $taskStamp + '.zip') }
Write-Host 'Portable ZIP wird erstellt ...'
[IO.Compression.ZipFile]::CreateFromDirectory($taskPortable,$taskZip,[IO.Compression.CompressionLevel]::Optimal,$true)
[IO.Compression.ZipFile]::CreateFromDirectory($taskSource,$taskSourceZip,[IO.Compression.CompressionLevel]::Optimal,$true)
Get-Item -LiteralPath $taskZip,$taskSourceZip | Select-Object FullName,@{Name='MB';Expression={[math]::Round($_.Length / 1MB,1)}} | Format-List
Write-Host "Entpacktes Testpaket: $taskPortable"
