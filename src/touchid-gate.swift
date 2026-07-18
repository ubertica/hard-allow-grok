/**
 * SecOps HARD ALLOW — macOS LocalAuthentication gate (Touch ID / device owner).
 * Exit 0 = verified, 1 = failed/cancelled, 2 = policy unavailable.
 *
 * Usage: swift touchid-gate.swift "reason string"
 */
import Foundation
import LocalAuthentication

let reason =
  CommandLine.arguments.count > 1
    ? CommandLine.arguments[1]
    : "SecOps HARD ALLOW — confirm operator identity"

let context = LAContext()
context.localizedCancelTitle = "Cancel"
var authError: NSError?

// Prefer biometrics; fall back to device owner (Touch ID or password)
let policy: LAPolicy
if context.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: &authError) {
  policy = .deviceOwnerAuthenticationWithBiometrics
} else if context.canEvaluatePolicy(.deviceOwnerAuthentication, error: &authError) {
  policy = .deviceOwnerAuthentication
} else {
  fputs("LA_POLICY_UNAVAILABLE: \(authError?.localizedDescription ?? "unknown")\n", stderr)
  exit(2)
}

let sem = DispatchSemaphore(value: 0)
var ok = false
var failMsg = ""

context.evaluatePolicy(policy, localizedReason: reason) { success, error in
  ok = success
  if let error = error {
    failMsg = error.localizedDescription
  }
  sem.signal()
}

_ = sem.wait(timeout: .now() + 120)

if ok {
  fputs("OK\n", stdout)
  exit(0)
}

fputs("LA_FAILED: \(failMsg)\n", stderr)
exit(1)
