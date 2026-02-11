package expo.modules.nuxieexpo

import android.content.pm.PackageManager
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.nuxieexpo.bridges.NuxiePurchaseDelegateBridge
import io.nuxie.sdk.NuxieDelegate
import io.nuxie.sdk.NuxieSDK
import io.nuxie.sdk.campaigns.Campaign
import io.nuxie.sdk.config.Environment
import io.nuxie.sdk.config.EventLinkingPolicy
import io.nuxie.sdk.config.LogLevel
import io.nuxie.sdk.config.NuxieConfiguration
import io.nuxie.sdk.features.FeatureAccess
import io.nuxie.sdk.features.FeatureCheckResult
import io.nuxie.sdk.features.FeatureType
import io.nuxie.sdk.features.FeatureUsageResult
import io.nuxie.sdk.flows.RemoteFlow
import io.nuxie.sdk.network.models.ProfileResponse
import io.nuxie.sdk.triggers.EntitlementUpdate
import io.nuxie.sdk.triggers.GateSource
import io.nuxie.sdk.triggers.JourneyExitReason
import io.nuxie.sdk.triggers.JourneyRef
import io.nuxie.sdk.triggers.JourneyUpdate
import io.nuxie.sdk.triggers.SuppressReason
import io.nuxie.sdk.triggers.TriggerDecision
import io.nuxie.sdk.triggers.TriggerHandle
import io.nuxie.sdk.triggers.TriggerUpdate
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.longOrNull
import java.util.concurrent.ConcurrentHashMap

class NuxieExpoModule : Module() {
  private val sdk: NuxieSDK = NuxieSDK.shared()
  private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
  private val triggerHandles = ConcurrentHashMap<String, TriggerHandle>()
  private val purchaseDelegateBridge = NuxiePurchaseDelegateBridge(::emitModuleEvent)

  override fun definition() = ModuleDefinition {
    Name("NuxieExpo")

    Events(
      "onTriggerUpdate",
      "onFeatureAccessChanged",
      "onPurchaseRequest",
      "onRestoreRequest",
      "onFlowPresented",
      "onFlowDismissed",
    )

    AsyncFunction("getDefaultApiKey") { promise: Promise ->
      val context = appContext.reactContext?.applicationContext
      if (context == null) {
        promise.resolve(null)
        return@AsyncFunction
      }

      try {
        val appInfo = context.packageManager.getApplicationInfo(context.packageName, PackageManager.GET_META_DATA)
        val apiKey = appInfo.metaData?.getString("NUXIE_API_KEY")
        promise.resolve(apiKey)
      } catch (_: Throwable) {
        promise.resolve(null)
      }
    }

    AsyncFunction("configure") {
      apiKey: String,
      options: Map<String, Any?>?,
      usePurchaseController: Boolean?,
      _wrapperVersion: String?,
      promise: Promise,
      ->
      if (apiKey.isBlank()) {
        promise.reject("MISSING_API_KEY", "Nuxie API key is required", null)
        return@AsyncFunction
      }

      try {
        val context = appContext.reactContext?.applicationContext
        if (context == null) {
          promise.reject("NO_CONTEXT", "React context is unavailable", null)
          return@AsyncFunction
        }

        val config = buildConfiguration(apiKey, options, usePurchaseController == true)
        sdk.delegate = object : NuxieDelegate {
          override fun featureAccessDidChange(featureId: String, from: FeatureAccess?, to: FeatureAccess) {
            emitModuleEvent(
              "onFeatureAccessChanged",
              mapOf(
                "featureId" to featureId,
                "from" to from?.toMap(),
                "to" to to.toMap(),
                "timestampMs" to System.currentTimeMillis(),
              ),
            )
          }

          override fun flowDismissed(
            journeyId: String,
            campaignId: String?,
            screenId: String?,
            reason: String,
            error: String?,
          ) {
            emitModuleEvent(
              "onFlowDismissed",
              mapOf(
                "flowId" to parseFlowIdFromCampaign(campaignId),
                "reason" to reason,
                "journeyId" to journeyId,
                "campaignId" to campaignId,
                "screenId" to screenId,
                "error" to error,
                "timestampMs" to System.currentTimeMillis(),
              ),
            )
          }
        }

        sdk.setup(context, config)
        promise.resolve(null)
      } catch (t: Throwable) {
        promise.reject("CONFIGURE_FAILED", t.message, t)
      }
    }

    AsyncFunction("shutdown") { promise: Promise ->
      scope.launch {
        runCatching {
          sdk.shutdown()
        }.onFailure {
          promise.reject("SHUTDOWN_FAILED", it.message, it)
          return@launch
        }

        triggerHandles.clear()
        promise.resolve(null)
      }
    }

    AsyncFunction("identify") {
      distinctId: String,
      userProperties: Map<String, Any?>?,
      userPropertiesSetOnce: Map<String, Any?>?,
      promise: Promise,
      ->
      try {
        sdk.identify(
          distinctId = distinctId,
          userProperties = userProperties,
          userPropertiesSetOnce = userPropertiesSetOnce,
        )
        promise.resolve(null)
      } catch (t: Throwable) {
        promise.reject("IDENTIFY_FAILED", t.message, t)
      }
    }

    AsyncFunction("reset") { keepAnonymousId: Boolean?, promise: Promise ->
      try {
        sdk.reset(keepAnonymousId = keepAnonymousId ?: true)
        promise.resolve(null)
      } catch (t: Throwable) {
        promise.reject("RESET_FAILED", t.message, t)
      }
    }

    AsyncFunction("getDistinctId") { promise: Promise ->
      promise.resolve(sdk.getDistinctId())
    }

    AsyncFunction("getAnonymousId") { promise: Promise ->
      promise.resolve(sdk.getAnonymousId())
    }

    AsyncFunction("getIsIdentified") { promise: Promise ->
      promise.resolve(sdk.isIdentified)
    }

    AsyncFunction("startTrigger") {
      requestId: String,
      eventName: String,
      options: Map<String, Any?>?,
      promise: Promise,
      ->
      try {
        val properties = options?.get("properties") as? Map<String, Any?>
        val userProperties = options?.get("userProperties") as? Map<String, Any?>
        val userPropertiesSetOnce = options?.get("userPropertiesSetOnce") as? Map<String, Any?>

        val handle = sdk.trigger(
          event = eventName,
          properties = properties,
          userProperties = userProperties,
          userPropertiesSetOnce = userPropertiesSetOnce,
        ) { update ->
          val terminal = update.isTerminal()
          emitModuleEvent(
            "onTriggerUpdate",
            mapOf(
              "requestId" to requestId,
              "update" to update.toMap(),
              "isTerminal" to terminal,
              "timestampMs" to System.currentTimeMillis(),
            ),
          )

          if (terminal) {
            triggerHandles.remove(requestId)
          }
        }

        triggerHandles[requestId] = handle
        promise.resolve(null)
      } catch (t: Throwable) {
        promise.reject("TRIGGER_START_FAILED", t.message, t)
      }
    }

    AsyncFunction("cancelTrigger") { requestId: String, promise: Promise ->
      triggerHandles.remove(requestId)?.cancel()
      promise.resolve(null)
    }

    AsyncFunction("showFlow") { flowId: String, promise: Promise ->
      try {
        sdk.showFlow(flowId)
        emitModuleEvent(
          "onFlowPresented",
          mapOf(
            "flowId" to flowId,
            "timestampMs" to System.currentTimeMillis(),
          ),
        )
        promise.resolve(null)
      } catch (t: Throwable) {
        promise.reject("SHOW_FLOW_FAILED", t.message, t)
      }
    }

    AsyncFunction("refreshProfile") { promise: Promise ->
      scope.launch {
        runCatching {
          sdk.refreshProfile()
        }.onSuccess {
          promise.resolve(it.toMap())
        }.onFailure {
          promise.reject("REFRESH_PROFILE_FAILED", it.message, it)
        }
      }
    }

    AsyncFunction("hasFeature") { featureId: String, requiredBalance: Int?, entityId: String?, promise: Promise ->
      scope.launch {
        runCatching {
          if (requiredBalance != null) {
            sdk.hasFeature(featureId = featureId, requiredBalance = requiredBalance, entityId = entityId)
          } else {
            sdk.hasFeature(featureId)
          }
        }.onSuccess {
          promise.resolve(it.toMap())
        }.onFailure {
          promise.reject("HAS_FEATURE_FAILED", it.message, it)
        }
      }
    }

    AsyncFunction("getCachedFeature") { featureId: String, entityId: String?, promise: Promise ->
      scope.launch {
        runCatching {
          sdk.getCachedFeature(featureId = featureId, entityId = entityId)
        }.onSuccess {
          promise.resolve(it?.toMap())
        }.onFailure {
          promise.reject("GET_CACHED_FEATURE_FAILED", it.message, it)
        }
      }
    }

    AsyncFunction("checkFeature") { featureId: String, requiredBalance: Int?, entityId: String?, promise: Promise ->
      scope.launch {
        runCatching {
          sdk.checkFeature(featureId = featureId, requiredBalance = requiredBalance, entityId = entityId)
        }.onSuccess {
          promise.resolve(it.toMap())
        }.onFailure {
          promise.reject("CHECK_FEATURE_FAILED", it.message, it)
        }
      }
    }

    AsyncFunction("refreshFeature") { featureId: String, requiredBalance: Int?, entityId: String?, promise: Promise ->
      scope.launch {
        runCatching {
          sdk.refreshFeature(featureId = featureId, requiredBalance = requiredBalance, entityId = entityId)
        }.onSuccess {
          promise.resolve(it.toMap())
        }.onFailure {
          promise.reject("REFRESH_FEATURE_FAILED", it.message, it)
        }
      }
    }

    AsyncFunction("useFeature") {
      featureId: String,
      amount: Double?,
      entityId: String?,
      metadata: Map<String, Any?>?,
      promise: Promise,
      ->
      try {
        sdk.useFeature(
          featureId = featureId,
          amount = amount ?: 1.0,
          entityId = entityId,
          metadata = metadata,
        )
        promise.resolve(null)
      } catch (t: Throwable) {
        promise.reject("USE_FEATURE_FAILED", t.message, t)
      }
    }

    AsyncFunction("useFeatureAndWait") {
      featureId: String,
      amount: Double?,
      entityId: String?,
      setUsage: Boolean?,
      metadata: Map<String, Any?>?,
      promise: Promise,
      ->
      scope.launch {
        runCatching {
          sdk.useFeatureAndWait(
            featureId = featureId,
            amount = amount ?: 1.0,
            entityId = entityId,
            setUsage = setUsage ?: false,
            metadata = metadata,
          )
        }.onSuccess {
          promise.resolve(it.toMap())
        }.onFailure {
          promise.reject("USE_FEATURE_AND_WAIT_FAILED", it.message, it)
        }
      }
    }

    AsyncFunction("flushEvents") { promise: Promise ->
      scope.launch {
        runCatching {
          sdk.flushEvents()
        }.onSuccess {
          promise.resolve(it)
        }.onFailure {
          promise.reject("FLUSH_EVENTS_FAILED", it.message, it)
        }
      }
    }

    AsyncFunction("getQueuedEventCount") { promise: Promise ->
      scope.launch {
        runCatching {
          sdk.getQueuedEventCount()
        }.onSuccess {
          promise.resolve(it)
        }.onFailure {
          promise.reject("QUEUED_COUNT_FAILED", it.message, it)
        }
      }
    }

    AsyncFunction("pauseEventQueue") { promise: Promise ->
      scope.launch {
        runCatching {
          sdk.pauseEventQueue()
        }.onSuccess {
          promise.resolve(null)
        }.onFailure {
          promise.reject("PAUSE_QUEUE_FAILED", it.message, it)
        }
      }
    }

    AsyncFunction("resumeEventQueue") { promise: Promise ->
      scope.launch {
        runCatching {
          sdk.resumeEventQueue()
        }.onSuccess {
          promise.resolve(null)
        }.onFailure {
          promise.reject("RESUME_QUEUE_FAILED", it.message, it)
        }
      }
    }

    AsyncFunction("completePurchase") { requestId: String, result: Map<String, Any?>, promise: Promise ->
      purchaseDelegateBridge.completePurchase(requestId, result)
      promise.resolve(null)
    }

    AsyncFunction("completeRestore") { requestId: String, result: Map<String, Any?>, promise: Promise ->
      purchaseDelegateBridge.completeRestore(requestId, result)
      promise.resolve(null)
    }
  }

  private fun emitModuleEvent(eventName: String, payload: Map<String, Any?>) {
    sendEvent(eventName, payload)
  }

  private fun parseFlowIdFromCampaign(campaignId: String?): String? {
    if (campaignId == null) {
      return null
    }

    val prefix = "flow:"
    return if (campaignId.startsWith(prefix)) {
      campaignId.removePrefix(prefix)
    } else {
      null
    }
  }

  private fun buildConfiguration(
    apiKey: String,
    options: Map<String, Any?>?,
    usePurchaseController: Boolean,
  ): NuxieConfiguration {
    val config = NuxieConfiguration(apiKey)
    if (options == null) {
      if (usePurchaseController) {
        config.purchaseDelegate = purchaseDelegateBridge
      }
      return config
    }

    when (options["environment"] as? String) {
      "production" -> config.environment = Environment.PRODUCTION
      "staging" -> config.environment = Environment.STAGING
      "development" -> config.environment = Environment.DEVELOPMENT
      "custom" -> config.environment = Environment.CUSTOM
    }

    (options["apiEndpoint"] as? String)?.let { config.setApiEndpoint(it) }

    config.logLevel = when (options["logLevel"] as? String) {
      "verbose" -> LogLevel.VERBOSE
      "debug" -> LogLevel.DEBUG
      "info" -> LogLevel.INFO
      "error" -> LogLevel.ERROR
      "none" -> LogLevel.NONE
      else -> LogLevel.WARNING
    }

    config.enableConsoleLogging = options["enableConsoleLogging"] as? Boolean ?: config.enableConsoleLogging
    config.enableFileLogging = options["enableFileLogging"] as? Boolean ?: config.enableFileLogging
    config.redactSensitiveData = options["redactSensitiveData"] as? Boolean ?: config.redactSensitiveData
    config.requestTimeoutSeconds = (options["requestTimeoutSeconds"] as? Number)?.toLong() ?: config.requestTimeoutSeconds
    config.retryCount = (options["retryCount"] as? Number)?.toInt() ?: config.retryCount
    config.retryDelaySeconds = (options["retryDelaySeconds"] as? Number)?.toLong() ?: config.retryDelaySeconds
    config.syncIntervalSeconds = (options["syncIntervalSeconds"] as? Number)?.toLong() ?: config.syncIntervalSeconds
    config.enableCompression = options["enableCompression"] as? Boolean ?: config.enableCompression
    config.eventBatchSize = (options["eventBatchSize"] as? Number)?.toInt() ?: config.eventBatchSize
    config.flushAt = (options["flushAt"] as? Number)?.toInt() ?: config.flushAt
    config.flushIntervalSeconds = (options["flushIntervalSeconds"] as? Number)?.toLong() ?: config.flushIntervalSeconds
    config.maxQueueSize = (options["maxQueueSize"] as? Number)?.toInt() ?: config.maxQueueSize
    config.maxCacheSizeBytes = (options["maxCacheSizeBytes"] as? Number)?.toLong() ?: config.maxCacheSizeBytes
    config.cacheExpirationSeconds = (options["cacheExpirationSeconds"] as? Number)?.toLong() ?: config.cacheExpirationSeconds
    config.enableEncryption = options["enableEncryption"] as? Boolean ?: config.enableEncryption
    config.featureCacheTtlSeconds = (options["featureCacheTtlSeconds"] as? Number)?.toLong() ?: config.featureCacheTtlSeconds
    config.defaultPaywallTimeoutSeconds =
      (options["defaultPaywallTimeoutSeconds"] as? Number)?.toLong() ?: config.defaultPaywallTimeoutSeconds
    config.respectDoNotTrack = options["respectDoNotTrack"] as? Boolean ?: config.respectDoNotTrack
    config.localeIdentifier = options["localeIdentifier"] as? String ?: config.localeIdentifier
    config.isDebugMode = options["isDebugMode"] as? Boolean ?: config.isDebugMode
    config.enablePlugins = options["enablePlugins"] as? Boolean ?: config.enablePlugins
    config.maxFlowCacheSizeBytes = (options["maxFlowCacheSizeBytes"] as? Number)?.toLong() ?: config.maxFlowCacheSizeBytes
    config.flowCacheExpirationSeconds =
      (options["flowCacheExpirationSeconds"] as? Number)?.toLong() ?: config.flowCacheExpirationSeconds
    config.maxConcurrentFlowDownloads =
      (options["maxConcurrentFlowDownloads"] as? Number)?.toInt() ?: config.maxConcurrentFlowDownloads
    config.flowDownloadTimeoutSeconds =
      (options["flowDownloadTimeoutSeconds"] as? Number)?.toLong() ?: config.flowDownloadTimeoutSeconds
    config.customStoragePath = options["customStoragePath"] as? String ?: config.customStoragePath
    config.flowCacheDirectory = options["flowCacheDirectory"] as? String ?: config.flowCacheDirectory

    config.eventLinkingPolicy = when (options["eventLinkingPolicy"] as? String) {
      "keep_separate", "keepSeparate" -> EventLinkingPolicy.KEEP_SEPARATE
      else -> EventLinkingPolicy.MIGRATE_ON_IDENTIFY
    }

    if (usePurchaseController) {
      config.purchaseDelegate = purchaseDelegateBridge
    }

    return config
  }

  override fun onDestroy() {
    super.onDestroy()
    scope.cancel()
  }
}

private fun TriggerUpdate.isTerminal(): Boolean {
  return when (this) {
    is TriggerUpdate.Error -> true
    is TriggerUpdate.Journey -> true
    is TriggerUpdate.Decision -> when (decision) {
      TriggerDecision.NoMatch,
      TriggerDecision.AllowedImmediate,
      TriggerDecision.DeniedImmediate,
      is TriggerDecision.Suppressed,
      -> true

      else -> false
    }

    is TriggerUpdate.Entitlement -> when (entitlement) {
      is EntitlementUpdate.Allowed,
      EntitlementUpdate.Denied,
      -> true

      EntitlementUpdate.Pending -> false
    }
  }
}

private fun TriggerUpdate.toMap(): Map<String, Any?> {
  return when (this) {
    is TriggerUpdate.Decision -> mapOf("kind" to "decision", "decision" to decision.toMap())
    is TriggerUpdate.Entitlement -> mapOf("kind" to "entitlement", "entitlement" to entitlement.toMap())
    is TriggerUpdate.Journey -> mapOf("kind" to "journey", "journey" to journey.toMap())
    is TriggerUpdate.Error -> mapOf(
      "kind" to "error",
      "error" to mapOf("code" to error.code, "message" to error.message),
    )
  }
}

private fun TriggerDecision.toMap(): Map<String, Any?> {
  return when (this) {
    TriggerDecision.NoMatch -> mapOf("type" to "no_match")
    TriggerDecision.AllowedImmediate -> mapOf("type" to "allowed_immediate")
    TriggerDecision.DeniedImmediate -> mapOf("type" to "denied_immediate")
    is TriggerDecision.JourneyStarted -> mapOf("type" to "journey_started", "ref" to ref.toMap())
    is TriggerDecision.JourneyResumed -> mapOf("type" to "journey_resumed", "ref" to ref.toMap())
    is TriggerDecision.FlowShown -> mapOf("type" to "flow_shown", "ref" to ref.toMap())
    is TriggerDecision.Suppressed -> mapOf("type" to "suppressed", "reason" to reason.toMap())
  }
}

private fun JourneyRef.toMap(): Map<String, Any?> {
  return mapOf(
    "journeyId" to journeyId,
    "campaignId" to campaignId,
    "flowId" to flowId,
  )
}

private fun SuppressReason.toMap(): Map<String, Any?> {
  return when (this) {
    SuppressReason.AlreadyActive -> mapOf("reason" to "already_active")
    SuppressReason.ReentryLimited -> mapOf("reason" to "reentry_limited")
    SuppressReason.Holdout -> mapOf("reason" to "holdout")
    SuppressReason.NoFlow -> mapOf("reason" to "no_flow")
    is SuppressReason.Unknown -> mapOf("reason" to "unknown", "rawReason" to value)
  }
}

private fun EntitlementUpdate.toMap(): Map<String, Any?> {
  return when (this) {
    EntitlementUpdate.Pending -> mapOf("type" to "pending")
    EntitlementUpdate.Denied -> mapOf("type" to "denied")
    is EntitlementUpdate.Allowed -> mapOf("type" to "allowed", "source" to source.toMap())
  }
}

private fun GateSource.toMap(): String {
  return when (this) {
    GateSource.CACHE -> "cache"
    GateSource.PURCHASE -> "purchase"
    GateSource.RESTORE -> "restore"
  }
}

private fun JourneyUpdate.toMap(): Map<String, Any?> {
  return mapOf(
    "journeyId" to journeyId,
    "campaignId" to campaignId,
    "flowId" to flowId,
    "exitReason" to exitReason.toMap(),
    "goalMet" to goalMet,
    "goalMetAtEpochMillis" to goalMetAtEpochMillis,
    "durationSeconds" to durationSeconds,
    "flowExitReason" to flowExitReason,
  )
}

private fun JourneyExitReason.toMap(): String {
  return when (this) {
    JourneyExitReason.COMPLETED -> "completed"
    JourneyExitReason.GOAL_MET -> "goal_met"
    JourneyExitReason.TRIGGER_UNMATCHED -> "trigger_unmatched"
    JourneyExitReason.EXPIRED -> "expired"
    JourneyExitReason.ERROR -> "error"
    JourneyExitReason.CANCELLED -> "cancelled"
  }
}

private fun FeatureType.toJsValue(): String {
  return when (this) {
    FeatureType.BOOLEAN -> "boolean"
    FeatureType.METERED -> "metered"
    FeatureType.CREDIT_SYSTEM -> "creditSystem"
  }
}

private fun FeatureAccess.toMap(): Map<String, Any?> {
  return mapOf(
    "allowed" to allowed,
    "unlimited" to unlimited,
    "balance" to balance,
    "type" to type.toJsValue(),
  )
}

private fun FeatureCheckResult.toMap(): Map<String, Any?> {
  return mapOf(
    "customerId" to customerId,
    "featureId" to featureId,
    "requiredBalance" to requiredBalance,
    "code" to code,
    "allowed" to allowed,
    "unlimited" to unlimited,
    "balance" to balance,
    "type" to type.toJsValue(),
    "preview" to preview?.toJsValue(),
  )
}

private fun FeatureUsageResult.toMap(): Map<String, Any?> {
  return mapOf(
    "success" to success,
    "featureId" to featureId,
    "amountUsed" to amountUsed,
    "message" to message,
    "usage" to usage?.let {
      mapOf(
        "current" to it.current,
        "limit" to it.limit,
        "remaining" to it.remaining,
      )
    },
  )
}

private fun ProfileResponse.toMap(): Map<String, Any?> {
  return mapOf(
    "campaigns" to campaigns.map { it.toMap() },
    "segments" to segments.map { mapOf("id" to it.id, "name" to it.name) },
    "flows" to flows.map { it.toMap() },
    "userProperties" to userProperties?.toJsValue(),
    "experiments" to experiments?.mapValues { (_, assignment) ->
      mapOf(
        "experimentKey" to assignment.experimentKey,
        "variantKey" to assignment.variantKey,
        "status" to assignment.status,
        "isHoldout" to assignment.isHoldout,
      )
    },
    "features" to (
      features?.map {
        mapOf(
          "id" to it.id,
          "type" to it.type.toJsValue(),
          "balance" to it.balance,
          "unlimited" to it.unlimited,
          "nextResetAt" to it.nextResetAt,
          "interval" to it.interval,
          "entities" to it.entities?.mapValues { (_, balance) -> mapOf("balance" to balance.balance) },
        )
      } ?: emptyList<Map<String, Any?>>()
      ),
    "journeys" to (
      journeys?.map {
        mapOf(
          "sessionId" to it.sessionId,
          "campaignId" to it.campaignId,
          "currentNodeId" to it.currentNodeId,
          "context" to it.context.toJsValue(),
        )
      } ?: emptyList<Map<String, Any?>>()
      ),
  )
}

private fun Campaign.toMap(): Map<String, Any?> {
  return mapOf(
    "id" to id,
    "name" to name,
    "flowId" to flowId,
    "flowNumber" to flowNumber,
    "flowName" to flowName,
    "publishedAt" to publishedAt,
    "campaignType" to campaignType,
  )
}

private fun RemoteFlow.toMap(): Map<String, Any?> {
  return mapOf("id" to id)
}

private fun JsonElement.toJsValue(): Any? {
  return when (this) {
    is JsonNull -> null
    is JsonArray -> map { it.toJsValue() }
    is JsonObject -> entries.associate { (key, value) -> key to value.toJsValue() }
    is JsonPrimitive -> {
      when {
        isString -> content
        booleanOrNull != null -> booleanOrNull
        longOrNull != null -> longOrNull
        doubleOrNull != null -> doubleOrNull
        else -> content
      }
    }
  }
}
