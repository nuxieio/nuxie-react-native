package expo.modules.nuxieexpo.bridges

import io.nuxie.sdk.purchases.NuxiePurchaseDelegate
import io.nuxie.sdk.purchases.PurchaseOutcome
import io.nuxie.sdk.purchases.PurchaseResult
import io.nuxie.sdk.purchases.RestoreResult
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.withTimeout

class NuxiePurchaseDelegateBridge(
  private val emitEvent: (eventName: String, payload: Map<String, Any?>) -> Unit,
  private val timeoutMs: Long = 60_000,
) : NuxiePurchaseDelegate {
  private val purchaseRequests = ConcurrentHashMap<String, CompletableDeferred<PurchaseOutcome>>()
  private val restoreRequests = ConcurrentHashMap<String, CompletableDeferred<RestoreResult>>()

  override suspend fun purchase(productId: String): PurchaseResult {
    return purchaseOutcome(productId).result
  }

  override suspend fun purchaseOutcome(productId: String): PurchaseOutcome {
    val requestId = UUID.randomUUID().toString()
    val deferred = CompletableDeferred<PurchaseOutcome>()
    purchaseRequests[requestId] = deferred

    emitEvent(
      "onPurchaseRequest",
      mapOf(
        "requestId" to requestId,
        "platform" to "android",
        "productId" to productId,
        "timestampMs" to System.currentTimeMillis(),
      ),
    )

    return try {
      withTimeout(timeoutMs) { deferred.await() }
    } catch (_: Throwable) {
      PurchaseOutcome(
        result = PurchaseResult.Failed("purchase_timeout"),
        productId = productId,
      )
    } finally {
      purchaseRequests.remove(requestId)
    }
  }

  override suspend fun restore(): RestoreResult {
    val requestId = UUID.randomUUID().toString()
    val deferred = CompletableDeferred<RestoreResult>()
    restoreRequests[requestId] = deferred

    emitEvent(
      "onRestoreRequest",
      mapOf(
        "requestId" to requestId,
        "platform" to "android",
        "timestampMs" to System.currentTimeMillis(),
      ),
    )

    return try {
      withTimeout(timeoutMs) { deferred.await() }
    } catch (_: Throwable) {
      RestoreResult.Failed("restore_timeout")
    } finally {
      restoreRequests.remove(requestId)
    }
  }

  fun completePurchase(requestId: String, payload: Map<String, Any?>) {
    val deferred = purchaseRequests.remove(requestId) ?: return
    deferred.complete(parsePurchaseOutcome(payload))
  }

  fun completeRestore(requestId: String, payload: Map<String, Any?>) {
    val deferred = restoreRequests.remove(requestId) ?: return
    deferred.complete(parseRestoreResult(payload))
  }

  private fun parsePurchaseOutcome(payload: Map<String, Any?>): PurchaseOutcome {
    return when ((payload["type"] as? String)?.lowercase()) {
      "success" -> PurchaseOutcome(
        result = PurchaseResult.Success,
        productId = payload["productId"] as? String,
        purchaseToken = payload["purchaseToken"] as? String,
        orderId = payload["orderId"] as? String,
      )

      "cancelled" -> PurchaseOutcome(
        result = PurchaseResult.Cancelled,
        productId = payload["productId"] as? String,
      )

      "pending" -> PurchaseOutcome(
        result = PurchaseResult.Pending,
        productId = payload["productId"] as? String,
      )

      else -> PurchaseOutcome(
        result = PurchaseResult.Failed((payload["message"] as? String) ?: "purchase_failed"),
        productId = payload["productId"] as? String,
      )
    }
  }

  private fun parseRestoreResult(payload: Map<String, Any?>): RestoreResult {
    return when ((payload["type"] as? String)?.lowercase()) {
      "success" -> {
        val restoredCount = when (val raw = payload["restoredCount"]) {
          is Int -> raw
          is Long -> raw.toInt()
          is Double -> raw.toInt()
          else -> 0
        }
        RestoreResult.Success(restoredCount)
      }

      "no_purchases" -> RestoreResult.NoPurchases
      else -> RestoreResult.Failed((payload["message"] as? String) ?: "restore_failed")
    }
  }
}
