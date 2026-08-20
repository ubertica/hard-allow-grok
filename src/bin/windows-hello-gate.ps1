# HARD ALLOW — Windows Hello / user consent (portable second factor)
# Exit 0 = verified
param([string]$Reason = "HARD ALLOW — confirm operator identity")
$ErrorActionPreference = "Stop"
try {
  Add-Type -AssemblyName System.Runtime.WindowsRuntime | Out-Null
  $asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
      $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
    })[0]
  [void][Windows.Security.Credentials.UI.UserConsentVerifier, Windows.Security.Credentials.UI, ContentType = WindowsRuntime]
  $op = [Windows.Security.Credentials.UI.UserConsentVerifier]::RequestVerificationAsync($Reason)
  $asTask = $asTaskGeneric.MakeGenericMethod([Windows.Security.Credentials.UI.UserConsentVerificationResult])
  $task = $asTask.Invoke($null, @($op))
  $task.Wait()
  $result = $task.Result
  if ($result -eq [Windows.Security.Credentials.UI.UserConsentVerificationResult]::Verified) {
    Write-Output "OK"
    exit 0
  }
  Write-Error "HELLO_FAILED $result"
  exit 1
} catch {
  Write-Error $_
  exit 2
}
