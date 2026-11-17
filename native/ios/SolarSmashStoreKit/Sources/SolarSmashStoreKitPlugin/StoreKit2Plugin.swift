import Foundation
import UIKit
import Capacitor

@objc(StoreKit2Plugin)
public class StoreKit2Plugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "StoreKit2Plugin"
    public let jsName = "StoreKit2"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getProducts", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "purchase", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "restore", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getEntitlements", returnType: CAPPluginReturnPromise)
    ]

    private let manager = StoreKit2Manager()
    private var foregroundObserver: NSObjectProtocol?

    private func publishTransaction(_ payload: VerifiedEntitlementPayload) {
        DispatchQueue.main.async { [weak self] in
            self?.notifyListeners("transactionUpdate", data: payload.toDictionary(), retainUntilConsumed: true)
        }
    }

    override public func load() {
        Task {
            await manager.startObservingTransactions { [weak self] payload in
                self?.publishTransaction(payload)
            }
        }

        foregroundObserver = NotificationCenter.default.addObserver(
            forName: UIApplication.willEnterForegroundNotification,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            guard let self else { return }
            Task {
                await self.manager.scanCurrentEntitlements()
            }
        }
    }

    deinit {
        if let observer = foregroundObserver {
            NotificationCenter.default.removeObserver(observer)
        }
        let manager = self.manager
        Task {
            await manager.stopObserving()
        }
    }

    @objc func getProducts(_ call: CAPPluginCall) {
        let productIds = call.getArray("productIds", String.self) ?? []
        Task {
            let result = await manager.getProducts(productIds: productIds)
            await MainActor.run { call.resolve(result.toDictionary()) }
        }
    }

    @objc func purchase(_ call: CAPPluginCall) {
        guard let productId = call.getString("productId"), !productId.isEmpty else {
            call.resolve(["status": "error"])
            return
        }
        Task {
            let result = await manager.purchase(productId: productId) { [weak self] payload in
                self?.publishTransaction(payload)
            }
            await MainActor.run { call.resolve(result.toDictionary()) }
        }
    }

    @objc func restore(_ call: CAPPluginCall) {
        Task {
            let result = await manager.restore()
            await MainActor.run { call.resolve(result.toDictionary()) }
        }
    }

    @objc func getEntitlements(_ call: CAPPluginCall) {
        Task {
            let result = await manager.getEntitlements()
            await MainActor.run { call.resolve(result.toDictionary()) }
        }
    }
}
