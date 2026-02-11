import ExpoModulesCore
import Foundation

#if canImport(Nuxie)
import Nuxie
#endif

public class NuxieExpoModule: Module {
  public static weak var shared: NuxieExpoModule?

  #if canImport(Nuxie)
  private var triggerHandles: [String: TriggerHandle] = [:]
  private let stateQueue = DispatchQueue(label: "io.nuxie.reactnative.state")
  private lazy var purchaseDelegateBridge = NuxiePurchaseDelegateBridge(emit: NuxieExpoModule.emitEvent)
  private lazy var delegateBridge = NuxieDelegateBridge(emit: NuxieExpoModule.emitEvent)
  #endif

  public required init(appContext: AppContext) {
    super.init(appContext: appContext)
    NuxieExpoModule.shared = self
  }

  static func emitEvent(_ eventName: String, _ payload: [String: Any]) {
    NuxieExpoModule.shared?.sendEvent(eventName, payload)
  }

  public func definition() -> ModuleDefinition {
    Name("NuxieExpo")

    Events(
      "onTriggerUpdate",
      "onFeatureAccessChanged",
      "onPurchaseRequest",
      "onRestoreRequest",
      "onFlowPresented",
      "onFlowDismissed"
    )

    AsyncFunction("getDefaultApiKey") { (promise: Promise) in
      let key = Bundle.main.object(forInfoDictionaryKey: "NUXIE_API_KEY") as? String
      promise.resolve(key)
    }

    AsyncFunction("configure") { (
      apiKey: String,
      options: [String: Any]?,
      usePurchaseController: Bool?,
      _wrapperVersion: String?,
      promise: Promise
    ) in
      let normalizedApiKey = apiKey.trimmingCharacters(in: .whitespacesAndNewlines)
      if normalizedApiKey.isEmpty {
        promise.reject(NuxieExpoError.missingApiKey)
        return
      }

      #if canImport(Nuxie)
      do {
        let config = self.makeConfiguration(
          apiKey: normalizedApiKey,
          options: options,
          usePurchaseController: usePurchaseController == true
        )
        NuxieSDK.shared.delegate = self.delegateBridge
        try NuxieSDK.shared.setup(with: config)
        promise.resolve(nil)
      } catch {
        promise.reject(error)
      }
      #else
      promise.reject(NuxieExpoError.unavailable)
      #endif
    }

    AsyncFunction("shutdown") { (promise: Promise) in
      #if canImport(Nuxie)
      Task {
        await NuxieSDK.shared.shutdown()
        self.clearState()
        promise.resolve(nil)
      }
      #else
      promise.resolve(nil)
      #endif
    }

    AsyncFunction("identify") { (
      distinctId: String,
      userProperties: [String: Any]?,
      userPropertiesSetOnce: [String: Any]?,
      promise: Promise
    ) in
      #if canImport(Nuxie)
      NuxieSDK.shared.identify(
        distinctId,
        userProperties: userProperties,
        userPropertiesSetOnce: userPropertiesSetOnce
      )
      promise.resolve(nil)
      #else
      promise.reject(NuxieExpoError.unavailable)
      #endif
    }

    AsyncFunction("reset") { (keepAnonymousId: Bool?, promise: Promise) in
      #if canImport(Nuxie)
      NuxieSDK.shared.reset(keepAnonymousId: keepAnonymousId ?? true)
      promise.resolve(nil)
      #else
      promise.reject(NuxieExpoError.unavailable)
      #endif
    }

    AsyncFunction("getDistinctId") { (promise: Promise) in
      #if canImport(Nuxie)
      promise.resolve(NuxieSDK.shared.getDistinctId())
      #else
      promise.resolve("")
      #endif
    }

    AsyncFunction("getAnonymousId") { (promise: Promise) in
      #if canImport(Nuxie)
      promise.resolve(NuxieSDK.shared.getAnonymousId())
      #else
      promise.resolve("")
      #endif
    }

    AsyncFunction("getIsIdentified") { (promise: Promise) in
      #if canImport(Nuxie)
      promise.resolve(NuxieSDK.shared.isIdentified)
      #else
      promise.resolve(false)
      #endif
    }

    AsyncFunction("startTrigger") { (
      requestId: String,
      eventName: String,
      options: [String: Any]?,
      promise: Promise
    ) in
      #if canImport(Nuxie)
      let properties = options?["properties"] as? [String: Any]
      let userProperties = options?["userProperties"] as? [String: Any]
      let userPropertiesSetOnce = options?["userPropertiesSetOnce"] as? [String: Any]

      let handle = NuxieSDK.shared.trigger(
        eventName,
        properties: properties,
        userProperties: userProperties,
        userPropertiesSetOnce: userPropertiesSetOnce
      ) { update in
        let isTerminal = self.isTerminal(update)
        NuxieExpoModule.emitEvent(
          "onTriggerUpdate",
          [
            "requestId": requestId,
            "update": self.triggerUpdateDictionary(update),
            "isTerminal": isTerminal,
            "timestampMs": Int(Date().timeIntervalSince1970 * 1000),
          ]
        )

        if isTerminal {
          self.stateQueue.async {
            self.triggerHandles.removeValue(forKey: requestId)
          }
        }
      }

      stateQueue.async {
        self.triggerHandles[requestId] = handle
      }
      promise.resolve(nil)
      #else
      promise.reject(NuxieExpoError.unavailable)
      #endif
    }

    AsyncFunction("cancelTrigger") { (requestId: String, promise: Promise) in
      #if canImport(Nuxie)
      stateQueue.async {
        if let handle = self.triggerHandles.removeValue(forKey: requestId) {
          handle.cancel()
        }
      }
      promise.resolve(nil)
      #else
      promise.resolve(nil)
      #endif
    }

    AsyncFunction("showFlow") { (flowId: String, promise: Promise) in
      #if canImport(Nuxie)
      Task {
        do {
          try await NuxieSDK.shared.showFlow(with: flowId)
          NuxieExpoModule.emitEvent(
            "onFlowPresented",
            [
              "flowId": flowId,
              "timestampMs": Int(Date().timeIntervalSince1970 * 1000),
            ]
          )
          promise.resolve(nil)
        } catch {
          promise.reject(error)
        }
      }
      #else
      promise.reject(NuxieExpoError.unavailable)
      #endif
    }

    AsyncFunction("refreshProfile") { (promise: Promise) in
      #if canImport(Nuxie)
      Task {
        do {
          let response = try await NuxieSDK.shared.refreshProfile()
          promise.resolve(self.toDictionary(response))
        } catch {
          promise.reject(error)
        }
      }
      #else
      promise.reject(NuxieExpoError.unavailable)
      #endif
    }

    AsyncFunction("hasFeature") { (
      featureId: String,
      requiredBalance: Int?,
      entityId: String?,
      promise: Promise
    ) in
      #if canImport(Nuxie)
      Task {
        do {
          let access: FeatureAccess
          if let requiredBalance {
            access = try await NuxieSDK.shared.hasFeature(featureId, requiredBalance: requiredBalance, entityId: entityId)
          } else {
            access = try await NuxieSDK.shared.hasFeature(featureId)
          }
          promise.resolve(featureAccessDictionary(access))
        } catch {
          promise.reject(error)
        }
      }
      #else
      promise.reject(NuxieExpoError.unavailable)
      #endif
    }

    AsyncFunction("getCachedFeature") { (
      featureId: String,
      entityId: String?,
      promise: Promise
    ) in
      #if canImport(Nuxie)
      Task {
        let access = await NuxieSDK.shared.getCachedFeature(featureId, entityId: entityId)
        promise.resolve(featureAccessDictionary(access))
      }
      #else
      promise.resolve(nil)
      #endif
    }

    AsyncFunction("checkFeature") { (
      featureId: String,
      requiredBalance: Int?,
      entityId: String?,
      promise: Promise
    ) in
      #if canImport(Nuxie)
      Task {
        do {
          let result = try await NuxieSDK.shared.checkFeature(
            featureId,
            requiredBalance: requiredBalance,
            entityId: entityId
          )
          promise.resolve(self.featureCheckResultDictionary(result))
        } catch {
          promise.reject(error)
        }
      }
      #else
      promise.reject(NuxieExpoError.unavailable)
      #endif
    }

    AsyncFunction("refreshFeature") { (
      featureId: String,
      requiredBalance: Int?,
      entityId: String?,
      promise: Promise
    ) in
      #if canImport(Nuxie)
      Task {
        do {
          let result = try await NuxieSDK.shared.refreshFeature(
            featureId,
            requiredBalance: requiredBalance,
            entityId: entityId
          )
          promise.resolve(self.featureCheckResultDictionary(result))
        } catch {
          promise.reject(error)
        }
      }
      #else
      promise.reject(NuxieExpoError.unavailable)
      #endif
    }

    AsyncFunction("useFeature") { (
      featureId: String,
      amount: Double?,
      entityId: String?,
      metadata: [String: Any]?,
      promise: Promise
    ) in
      #if canImport(Nuxie)
      NuxieSDK.shared.useFeature(featureId, amount: amount ?? 1.0, entityId: entityId, metadata: metadata)
      promise.resolve(nil)
      #else
      promise.reject(NuxieExpoError.unavailable)
      #endif
    }

    AsyncFunction("useFeatureAndWait") { (
      featureId: String,
      amount: Double?,
      entityId: String?,
      setUsage: Bool?,
      metadata: [String: Any]?,
      promise: Promise
    ) in
      #if canImport(Nuxie)
      Task {
        do {
          let result = try await NuxieSDK.shared.useFeatureAndWait(
            featureId,
            amount: amount ?? 1.0,
            entityId: entityId,
            setUsage: setUsage ?? false,
            metadata: metadata
          )
          promise.resolve(self.featureUsageResultDictionary(result))
        } catch {
          promise.reject(error)
        }
      }
      #else
      promise.reject(NuxieExpoError.unavailable)
      #endif
    }

    AsyncFunction("flushEvents") { (promise: Promise) in
      #if canImport(Nuxie)
      Task {
        let success = await NuxieSDK.shared.flushEvents()
        promise.resolve(success)
      }
      #else
      promise.resolve(false)
      #endif
    }

    AsyncFunction("getQueuedEventCount") { (promise: Promise) in
      #if canImport(Nuxie)
      Task {
        let count = await NuxieSDK.shared.getQueuedEventCount()
        promise.resolve(count)
      }
      #else
      promise.resolve(0)
      #endif
    }

    AsyncFunction("pauseEventQueue") { (promise: Promise) in
      #if canImport(Nuxie)
      Task {
        await NuxieSDK.shared.pauseEventQueue()
        promise.resolve(nil)
      }
      #else
      promise.resolve(nil)
      #endif
    }

    AsyncFunction("resumeEventQueue") { (promise: Promise) in
      #if canImport(Nuxie)
      Task {
        await NuxieSDK.shared.resumeEventQueue()
        promise.resolve(nil)
      }
      #else
      promise.resolve(nil)
      #endif
    }

    AsyncFunction("completePurchase") { (
      requestId: String,
      result: [String: Any],
      promise: Promise
    ) in
      #if canImport(Nuxie)
      purchaseDelegateBridge.completePurchase(requestId: requestId, payload: result)
      promise.resolve(nil)
      #else
      promise.resolve(nil)
      #endif
    }

    AsyncFunction("completeRestore") { (
      requestId: String,
      result: [String: Any],
      promise: Promise
    ) in
      #if canImport(Nuxie)
      purchaseDelegateBridge.completeRestore(requestId: requestId, payload: result)
      promise.resolve(nil)
      #else
      promise.resolve(nil)
      #endif
    }
  }

  #if canImport(Nuxie)
  private func clearState() {
    stateQueue.async {
      self.triggerHandles.removeAll()
    }
  }

  private func makeConfiguration(apiKey: String, options: [String: Any]?, usePurchaseController: Bool) -> NuxieConfiguration {
    let config = NuxieConfiguration(apiKey: apiKey)
    guard let options else {
      if usePurchaseController {
        config.purchaseDelegate = purchaseDelegateBridge
      }
      return config
    }

    if let environment = options["environment"] as? String {
      switch environment {
      case "production":
        config.environment = .production
      case "staging":
        config.environment = .staging
      case "development":
        config.environment = .development
      case "custom":
        config.environment = .custom
      default:
        break
      }
    }

    if let endpoint = options["apiEndpoint"] as? String, let url = URL(string: endpoint) {
      config.apiEndpoint = url
      config.environment = .custom
    }

    if let logLevel = options["logLevel"] as? String {
      switch logLevel {
      case "verbose":
        config.logLevel = .verbose
      case "debug":
        config.logLevel = .debug
      case "info":
        config.logLevel = .info
      case "warning":
        config.logLevel = .warning
      case "error":
        config.logLevel = .error
      case "none":
        config.logLevel = .none
      default:
        break
      }
    }

    if let value = options["enableConsoleLogging"] as? Bool {
      config.enableConsoleLogging = value
    }
    if let value = options["enableFileLogging"] as? Bool {
      config.enableFileLogging = value
    }
    if let value = options["redactSensitiveData"] as? Bool {
      config.redactSensitiveData = value
    }
    if let value = timeInterval(options["requestTimeoutSeconds"]) {
      config.requestTimeout = value
    }
    if let value = int(options["retryCount"]) {
      config.retryCount = value
    }
    if let value = timeInterval(options["retryDelaySeconds"]) {
      config.retryDelay = value
    }
    if let value = timeInterval(options["syncIntervalSeconds"]) {
      config.syncInterval = value
    }
    if let value = options["enableCompression"] as? Bool {
      config.enableCompression = value
    }
    if let value = int(options["eventBatchSize"]) {
      config.eventBatchSize = value
    }
    if let value = int(options["flushAt"]) {
      config.flushAt = value
    }
    if let value = timeInterval(options["flushIntervalSeconds"]) {
      config.flushInterval = value
    }
    if let value = int(options["maxQueueSize"]) {
      config.maxQueueSize = value
    }
    if let value = int64(options["maxCacheSizeBytes"]) {
      config.maxCacheSize = value
    }
    if let value = timeInterval(options["cacheExpirationSeconds"]) {
      config.cacheExpiration = value
    }
    if let value = options["enableEncryption"] as? Bool {
      config.enableEncryption = value
    }
    if let value = timeInterval(options["featureCacheTtlSeconds"]) {
      config.featureCacheTTL = value
    }
    if let value = timeInterval(options["defaultPaywallTimeoutSeconds"]) {
      config.defaultPaywallTimeout = value
    }
    if let value = options["respectDoNotTrack"] as? Bool {
      config.respectDoNotTrack = value
    }
    if let value = options["localeIdentifier"] as? String {
      config.localeIdentifier = value.isEmpty ? nil : value
    }
    if let value = options["isDebugMode"] as? Bool {
      config.isDebugMode = value
    }
    if let value = options["enablePlugins"] as? Bool {
      config.enablePlugins = value
    }
    if let value = int64(options["maxFlowCacheSizeBytes"]) {
      config.maxFlowCacheSize = value
    }
    if let value = timeInterval(options["flowCacheExpirationSeconds"]) {
      config.flowCacheExpiration = value
    }
    if let value = int(options["maxConcurrentFlowDownloads"]) {
      config.maxConcurrentFlowDownloads = value
    }
    if let value = timeInterval(options["flowDownloadTimeoutSeconds"]) {
      config.flowDownloadTimeout = value
    }
    if let value = options["customStoragePath"] as? String, let url = parseURL(value) {
      config.customStoragePath = url
    }
    if let value = options["flowCacheDirectory"] as? String, let url = parseURL(value) {
      config.flowCacheDirectory = url
    }

    if let linking = options["eventLinkingPolicy"] as? String {
      config.eventLinkingPolicy = (linking == "keep_separate" || linking == "keepSeparate")
        ? .keepSeparate
        : .migrateOnIdentify
    }

    if usePurchaseController {
      config.purchaseDelegate = purchaseDelegateBridge
    }

    return config
  }

  private func isTerminal(_ update: TriggerUpdate) -> Bool {
    switch update {
    case .error:
      return true
    case .journey:
      return true
    case .entitlement(let entitlement):
      switch entitlement {
      case .allowed, .denied:
        return true
      case .pending:
        return false
      }
    case .decision(let decision):
      switch decision {
      case .allowedImmediate, .deniedImmediate, .noMatch, .suppressed:
        return true
      default:
        return false
      }
    }
  }

  private func triggerUpdateDictionary(_ update: TriggerUpdate) -> [String: Any] {
    switch update {
    case .decision(let decision):
      return ["kind": "decision", "decision": triggerDecisionDictionary(decision)]
    case .entitlement(let entitlement):
      return ["kind": "entitlement", "entitlement": entitlementDictionary(entitlement)]
    case .journey(let journey):
      return ["kind": "journey", "journey": journeyDictionary(journey)]
    case .error(let error):
      return [
        "kind": "error",
        "error": [
          "code": error.code,
          "message": error.message,
        ],
      ]
    }
  }

  private func triggerDecisionDictionary(_ decision: TriggerDecision) -> [String: Any] {
    switch decision {
    case .noMatch:
      return ["type": "no_match"]
    case .allowedImmediate:
      return ["type": "allowed_immediate"]
    case .deniedImmediate:
      return ["type": "denied_immediate"]
    case .journeyStarted(let ref):
      return ["type": "journey_started", "ref": journeyRefDictionary(ref)]
    case .journeyResumed(let ref):
      return ["type": "journey_resumed", "ref": journeyRefDictionary(ref)]
    case .flowShown(let ref):
      return ["type": "flow_shown", "ref": journeyRefDictionary(ref)]
    case .suppressed(let reason):
      return ["type": "suppressed", "reason": suppressReasonDictionary(reason)]
    }
  }

  private func entitlementDictionary(_ entitlement: EntitlementUpdate) -> [String: Any] {
    switch entitlement {
    case .pending:
      return ["type": "pending"]
    case .denied:
      return ["type": "denied"]
    case .allowed(let source):
      return [
        "type": "allowed",
        "source": gateSourceString(source),
      ]
    }
  }

  private func suppressReasonDictionary(_ reason: SuppressReason) -> [String: Any] {
    switch reason {
    case .alreadyActive:
      return ["reason": "already_active"]
    case .reentryLimited:
      return ["reason": "reentry_limited"]
    case .holdout:
      return ["reason": "holdout"]
    case .noFlow:
      return ["reason": "no_flow"]
    case .unknown(let value):
      return ["reason": "unknown", "rawReason": value]
    }
  }

  private func journeyRefDictionary(_ ref: JourneyRef) -> [String: Any] {
    [
      "journeyId": ref.journeyId,
      "campaignId": ref.campaignId,
      "flowId": ref.flowId as Any,
    ]
  }

  private func journeyDictionary(_ update: JourneyUpdate) -> [String: Any] {
    [
      "journeyId": update.journeyId,
      "campaignId": update.campaignId,
      "flowId": update.flowId as Any,
      "exitReason": update.exitReason.rawValue,
      "goalMet": update.goalMet,
      "goalMetAtEpochMillis": update.goalMetAt.map { Int($0.timeIntervalSince1970 * 1000) } as Any,
      "durationSeconds": update.durationSeconds as Any,
      "flowExitReason": update.flowExitReason as Any,
    ]
  }

  private func gateSourceString(_ source: GateSource) -> String {
    switch source {
    case .cache:
      return "cache"
    case .purchase:
      return "purchase"
    case .restore:
      return "restore"
    }
  }

  private func featureCheckResultDictionary(_ result: FeatureCheckResult) -> [String: Any] {
    [
      "customerId": result.customerId,
      "featureId": result.featureId,
      "requiredBalance": result.requiredBalance,
      "code": result.code,
      "allowed": result.allowed,
      "unlimited": result.unlimited,
      "balance": result.balance as Any,
      "type": result.type.rawValue,
      "preview": result.preview?.value as Any,
    ]
  }

  private func featureUsageResultDictionary(_ result: FeatureUsageResult) -> [String: Any] {
    var payload: [String: Any] = [
      "success": result.success,
      "featureId": result.featureId,
      "amountUsed": result.amountUsed,
      "message": result.message as Any,
    ]
    if let usage = result.usage {
      payload["usage"] = [
        "current": usage.current,
        "limit": usage.limit as Any,
        "remaining": usage.remaining as Any,
      ]
    }
    return payload
  }

  private func toDictionary<T: Encodable>(_ value: T) -> [String: Any] {
    do {
      let data = try JSONEncoder().encode(value)
      if let object = try JSONSerialization.jsonObject(with: data) as? [String: Any] {
        return object
      }
    } catch {
      return [:]
    }
    return [:]
  }

  private func int(_ value: Any?) -> Int? {
    if let value = value as? Int {
      return value
    }
    if let value = value as? NSNumber {
      return value.intValue
    }
    return nil
  }

  private func int64(_ value: Any?) -> Int64? {
    if let value = value as? Int64 {
      return value
    }
    if let value = value as? NSNumber {
      return value.int64Value
    }
    return nil
  }

  private func timeInterval(_ value: Any?) -> TimeInterval? {
    if let value = value as? TimeInterval {
      return value
    }
    if let value = value as? NSNumber {
      return value.doubleValue
    }
    return nil
  }

  private func parseURL(_ value: String) -> URL? {
    let normalized = value.trimmingCharacters(in: .whitespacesAndNewlines)
    if normalized.isEmpty {
      return nil
    }
    if normalized.contains("://") {
      return URL(string: normalized)
    }
    return URL(fileURLWithPath: normalized)
  }
  #endif
}

enum NuxieExpoError: Error, LocalizedError {
  case unavailable
  case missingApiKey

  var errorDescription: String? {
    switch self {
    case .unavailable:
      return "Nuxie iOS SDK is unavailable in this build."
    case .missingApiKey:
      return "Nuxie API key is required."
    }
  }
}
