import Foundation

#if canImport(Nuxie)
import Nuxie

final class NuxiePurchaseDelegateBridge: NuxiePurchaseDelegate {
  private let emit: (String, [String: Any]) -> Void
  private let timeoutSeconds: TimeInterval
  private let lock = NSLock()
  private var purchaseContinuations: [String: CheckedContinuation<PurchaseOutcome, Never>] = [:]
  private var restoreContinuations: [String: CheckedContinuation<RestoreResult, Never>] = [:]

  init(
    timeoutSeconds: TimeInterval = 60,
    emit: @escaping (String, [String: Any]) -> Void
  ) {
    self.timeoutSeconds = timeoutSeconds
    self.emit = emit
  }

  func purchase(_ product: any StoreProductProtocol) async -> PurchaseResult {
    let outcome = await purchaseOutcome(product)
    return outcome.result
  }

  func purchaseOutcome(_ product: any StoreProductProtocol) async -> PurchaseOutcome {
    let requestId = UUID().uuidString
    let payload: [String: Any] = [
      "requestId": requestId,
      "platform": "ios",
      "productId": product.id,
      "displayName": product.displayName,
      "displayPrice": product.displayPrice,
      "price": NSDecimalNumber(decimal: product.price).doubleValue,
      "timestampMs": Int(Date().timeIntervalSince1970 * 1000),
    ]

    return await withCheckedContinuation { continuation in
      lock.lock()
      purchaseContinuations[requestId] = continuation
      lock.unlock()

      emit("onPurchaseRequest", payload)
      schedulePurchaseTimeout(requestId: requestId, fallbackProductId: product.id)
    }
  }

  func restore() async -> RestoreResult {
    let requestId = UUID().uuidString
    let payload: [String: Any] = [
      "requestId": requestId,
      "platform": "ios",
      "timestampMs": Int(Date().timeIntervalSince1970 * 1000),
    ]

    return await withCheckedContinuation { continuation in
      lock.lock()
      restoreContinuations[requestId] = continuation
      lock.unlock()

      emit("onRestoreRequest", payload)
      scheduleRestoreTimeout(requestId: requestId)
    }
  }

  func completePurchase(requestId: String, payload: [String: Any]) {
    lock.lock()
    let continuation = purchaseContinuations.removeValue(forKey: requestId)
    lock.unlock()

    guard let continuation else { return }
    continuation.resume(returning: purchaseOutcome(from: payload))
  }

  func completeRestore(requestId: String, payload: [String: Any]) {
    lock.lock()
    let continuation = restoreContinuations.removeValue(forKey: requestId)
    lock.unlock()

    guard let continuation else { return }
    continuation.resume(returning: restoreResult(from: payload))
  }

  private func schedulePurchaseTimeout(requestId: String, fallbackProductId: String) {
    Task {
      try? await Task.sleep(nanoseconds: UInt64(timeoutSeconds * 1_000_000_000))
      lock.lock()
      let continuation = purchaseContinuations.removeValue(forKey: requestId)
      lock.unlock()

      guard let continuation else { return }
      continuation.resume(
        returning: PurchaseOutcome(
          result: .failed(nuxieBridgeError("purchase_timeout")),
          productId: fallbackProductId
        )
      )
    }
  }

  private func scheduleRestoreTimeout(requestId: String) {
    Task {
      try? await Task.sleep(nanoseconds: UInt64(timeoutSeconds * 1_000_000_000))
      lock.lock()
      let continuation = restoreContinuations.removeValue(forKey: requestId)
      lock.unlock()

      guard let continuation else { return }
      continuation.resume(returning: .failed(nuxieBridgeError("restore_timeout")))
    }
  }

  private func purchaseOutcome(from payload: [String: Any]) -> PurchaseOutcome {
    let type = (payload["type"] as? String)?.lowercased() ?? "failed"
    switch type {
    case "success":
      return PurchaseOutcome(
        result: .success,
        transactionJws: payload["transactionJws"] as? String,
        transactionId: payload["transactionId"] as? String,
        originalTransactionId: payload["originalTransactionId"] as? String,
        productId: payload["productId"] as? String
      )
    case "cancelled":
      return PurchaseOutcome(
        result: .cancelled,
        productId: payload["productId"] as? String
      )
    case "pending":
      return PurchaseOutcome(
        result: .pending,
        productId: payload["productId"] as? String
      )
    default:
      let message = (payload["message"] as? String) ?? "purchase_failed"
      return PurchaseOutcome(
        result: .failed(nuxieBridgeError(message)),
        productId: payload["productId"] as? String
      )
    }
  }

  private func restoreResult(from payload: [String: Any]) -> RestoreResult {
    let type = (payload["type"] as? String)?.lowercased() ?? "failed"
    switch type {
    case "success":
      let restoredCount = payload["restoredCount"] as? Int ?? 0
      return .success(restoredCount: restoredCount)
    case "no_purchases":
      return .noPurchases
    default:
      let message = (payload["message"] as? String) ?? "restore_failed"
      return .failed(nuxieBridgeError(message))
    }
  }

  private func nuxieBridgeError(_ message: String) -> Error {
    NSError(domain: "io.nuxie.reactnative", code: 1, userInfo: [NSLocalizedDescriptionKey: message])
  }
}
#endif
