@echo off
setlocal
set "FLIGHTSTUDIO_DATA_DIR=%~dp0data"
set "FLIGHTSTUDIO_DESKTOP_EXE=%~dp0release\desktop-2.5.0\win-unpacked\FlightStudio V2.exe"
if not exist "%FLIGHTSTUDIO_DESKTOP_EXE%" (
  echo Bitte zuerst die Desktop-Ausgabe erstellen oder das Installationsprogramm verwenden.
  pause
  exit /b 1
)
start "" "%FLIGHTSTUDIO_DESKTOP_EXE%"
