import Foundation

#if canImport(Nuxie)
import Nuxie

@MainActor
final class NuxieDelegateBridge: NuxieDelegate {
  private let emit: (String, [String: Any]) -> Void

  init(emit: @escaping (String, [String: Any]) -> Void) {
    self.emit = emit
  }

  func featureAccessDidChange(_ featureId: String, from oldValue: FeatureAccess?, to newValue: FeatureAccess) {
    emit(
      "onFeatureAccessChanged",
      [
        "featureId": featureId,
        "from": featureAccessDictionary(oldValue) as Any,
        "to": featureAccessDictionary(newValue),
        "timestampMs": Int(Date().timeIntervalSince1970 * 1000),
      ]
    )
  }
}

func featureAccessDictionary(_ access: FeatureAccess?) -> [String: Any]? {
  guard let access else { return nil }
  return [
    "allowed": access.allowed,
    "unlimited": access.unlimited,
    "balance": access.balance as Any,
    "type": access.type.rawValue,
  ]
}
#endif
