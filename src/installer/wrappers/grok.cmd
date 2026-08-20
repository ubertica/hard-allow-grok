@echo off
setlocal EnableExtensions
set "HA_DIR=%USERPROFILE%\.grok\hard-allow"
if defined GROK_REAL goto :have
if exist "%HA_DIR%\grok-paths.cmd" call "%HA_DIR%\grok-paths.cmd"
:have
if not defined GROK_REAL set "GROK_REAL=%USERPROFILE%\.grok\bin\grok-real.exe"
if not exist "%GROK_REAL%" (
  echo grok real binary not found. Set GROK_REAL or re-run install.mjs --wire-grok 1>&2
  exit /b 127
)
if /I "%~1"=="--hard-allow" (
  node "%HA_DIR%\ceremony.mjs"
  if errorlevel 1 exit /b 1
  shift
)
if /I "%~1"=="--hard-allow=reuse" (
  node "%HA_DIR%\ceremony.mjs" --reuse-if-active
  shift
)
"%GROK_REAL%" %*
exit /b %ERRORLEVEL%
