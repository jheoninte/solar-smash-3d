import Foundation
import StoreKit

struct VerifiedEntitlementPayload: Sendable {
    let productId: String
    let owned: Bool
    let verified: Bool
    let transactionId: String?

    func toDictionary() -> [String: Any] {
        var dict: [String: Any] = [
            "productId": productId,
            "owned": owned,
            "verified": verified
        ]
        if let transactionId {
            dict["transactionId"] = transactionId
        }
        return dict
    }
}

struct StoreProductPayload: Sendable {
    let productId: String
    let displayPrice: String
    let title: String
    let description: String
    let available: Bool

    func toDictionary() -> [String: Any] {
        [
            "productId": productId,
            "displayPrice": displayPrice,
            "title": title,
            "description": description,
            "available": available
        ]
    }
}

struct ProductsQueryResult: Sendable {
    let status: String
    let products: [StoreProductPayload]

    func toDictionary() -> [String: Any] {
        [
            "status": status,
            "products": products.map { $0.toDictionary() }
        ]
    }
}

struct PurchaseOutcome: Sendable {
    let status: String
    let entitlement: VerifiedEntitlementPayload?

    func toDictionary() -> [String: Any] {
        var dict: [String: Any] = ["status": status]
        if let entitlement {
            dict["entitlement"] = entitlement.toDictionary()
        }
        return dict
    }
}

struct EntitlementsQueryResult: Sendable {
    let status: String
    let verified: Bool
    let entitlements: [VerifiedEntitlementPayload]

    func toDictionary() -> [String: Any] {
        [
            "status": status,
            "verified": verified,
            "entitlements": entitlements.map { $0.toDictionary() }
        ]
    }
}

actor StoreKit2Manager {
    private var updatesTask: Task<Void, Never>?
    private var isStopped = false
    private var transactionObserver: (@Sendable (VerifiedEntitlementPayload) -> Void)?
    private var inFlightPurchases: Set<String> = []
    private var lastReportedOwnership: [String: Bool] = [:]
    private var ownershipRevision = 0

    func startObservingTransactions(onUpdate: @escaping @Sendable (VerifiedEntitlementPayload) -> Void) {
        guard !isStopped, updatesTask == nil else { return }
        transactionObserver = onUpdate
        updatesTask = Task { [weak self] in
            for await result in Transaction.updates {
                if Task.isCancelled { break }
                guard let self else { break }
                await self.handleTransactionResult(result, onUpdate: onUpdate)
            }
        }
    }

    func stopObserving() {
        isStopped = true
        transactionObserver = nil
        updatesTask?.cancel()
        updatesTask = nil
    }

    private func handleTransactionResult(
        _ result: VerificationResult<Transaction>,
        onUpdate: @Sendable (VerifiedEntitlementPayload) -> Void
    ) async {
        guard !isStopped else { return }
        switch result {
        case .verified(let transaction):
            guard transaction.productType == .nonConsumable else { return }
            ownershipRevision += 1
            let owned = transaction.revocationDate == nil
            let productId = transaction.productID
            if lastReportedOwnership[productId] != owned {
                lastReportedOwnership[productId] = owned
                onUpdate(VerifiedEntitlementPayload(
                    productId: productId,
                    owned: owned,
                    verified: true,
                    transactionId: String(transaction.id)
                ))
            }
            await transaction.finish()
        case .unverified:
            // Never grant or revoke entitlements on unverified transactions.
            break
        }
    }

    func getProducts(productIds: [String]) async -> ProductsQueryResult {
        let uniqueIds = Array(Set(productIds.filter { !$0.isEmpty }))
        if uniqueIds.isEmpty {
            return ProductsQueryResult(status: "ok", products: [])
        }
        do {
            let storeProducts = try await Product.products(for: uniqueIds)
            let mapped: [StoreProductPayload] = storeProducts.filter { $0.type == .nonConsumable }.map { product in
                StoreProductPayload(
                    productId: product.id,
                    displayPrice: product.displayPrice,
                    title: product.displayName,
                    description: product.description,
                    available: !product.displayPrice.isEmpty
                )
            }
            return ProductsQueryResult(status: "ok", products: mapped)
        } catch let urlError as URLError where urlError.code == .notConnectedToInternet {
            return ProductsQueryResult(status: "offline", products: [])
        } catch {
            return ProductsQueryResult(status: "error", products: [])
        }
    }

    func purchase(
        productId: String,
        onUpdate: @Sendable (VerifiedEntitlementPayload) -> Void
    ) async -> PurchaseOutcome {
        if inFlightPurchases.contains(productId) {
            return PurchaseOutcome(status: "busy", entitlement: nil)
        }
        inFlightPurchases.insert(productId)
        defer { inFlightPurchases.remove(productId) }

        do {
            let products = try await Product.products(for: [productId])
            guard let product = products.first(where: { $0.id == productId && $0.type == .nonConsumable }) else {
                return PurchaseOutcome(status: "error", entitlement: nil)
            }

            let purchaseResult = try await product.purchase()
            switch purchaseResult {
            case .success(let verification):
                switch verification {
                case .verified(let transaction):
                    guard transaction.productID == productId else {
                        return PurchaseOutcome(status: "unverified", entitlement: nil)
                    }
                    let owned = transaction.revocationDate == nil
                    ownershipRevision += 1
                    lastReportedOwnership[productId] = owned
                    let entitlement = VerifiedEntitlementPayload(
                        productId: productId,
                        owned: owned,
                        verified: true,
                        transactionId: String(transaction.id)
                    )
                    onUpdate(entitlement)
                    await transaction.finish()
                    return PurchaseOutcome(status: "success", entitlement: entitlement)
                case .unverified:
                    return PurchaseOutcome(status: "unverified", entitlement: nil)
                }
            case .userCancelled:
                return PurchaseOutcome(status: "cancelled", entitlement: nil)
            case .pending:
                return PurchaseOutcome(status: "pending", entitlement: nil)
            @unknown default:
                return PurchaseOutcome(status: "error", entitlement: nil)
            }
        } catch let urlError as URLError where urlError.code == .notConnectedToInternet {
            return PurchaseOutcome(status: "offline", entitlement: nil)
        } catch let storeError as StoreKitError {
            if case .userCancelled = storeError {
                return PurchaseOutcome(status: "cancelled", entitlement: nil)
            }
            if case .networkError = storeError {
                return PurchaseOutcome(status: "offline", entitlement: nil)
            }
            return PurchaseOutcome(status: "error", entitlement: nil)
        } catch {
            return PurchaseOutcome(status: "error", entitlement: nil)
        }
    }

    func restore() async -> EntitlementsQueryResult {
        do {
            try await AppStore.sync()
            return await getEntitlements()
        } catch let urlError as URLError where urlError.code == .notConnectedToInternet {
            return EntitlementsQueryResult(status: "offline", verified: false, entitlements: [])
        } catch let storeError as StoreKitError {
            if case .userCancelled = storeError {
                return EntitlementsQueryResult(status: "cancelled", verified: false, entitlements: [])
            }
            if case .networkError = storeError {
                return EntitlementsQueryResult(status: "offline", verified: false, entitlements: [])
            }
            return EntitlementsQueryResult(status: "error", verified: false, entitlements: [])
        } catch {
            return EntitlementsQueryResult(status: "error", verified: false, entitlements: [])
        }
    }

    func scanCurrentEntitlements() async {
        // Accepted snapshots publish changes atomically, including removals.
        _ = await getEntitlements()
    }

    func getEntitlements() async -> EntitlementsQueryResult {
        for _ in 0..<2 {
            let revision = ownershipRevision
            var verifiedEntries: [VerifiedEntitlementPayload] = []
            var currentOwnership: [String: Bool] = [:]
            var sawUnverified = false

            for await result in Transaction.currentEntitlements {
                switch result {
                case .verified(let transaction):
                    guard transaction.productType == .nonConsumable else { continue }
                    let owned = transaction.revocationDate == nil
                    let productId = transaction.productID
                    currentOwnership[productId] = owned
                    verifiedEntries.append(VerifiedEntitlementPayload(
                        productId: productId,
                        owned: owned,
                        verified: true,
                        transactionId: String(transaction.id)
                    ))
                case .unverified:
                    // Partial/unverified snapshot must never masquerade as an empty verified list.
                    sawUnverified = true
                }
            }

            if sawUnverified {
                return EntitlementsQueryResult(status: "error", verified: false, entitlements: [])
            }

            guard !isStopped else {
                return EntitlementsQueryResult(status: "error", verified: false, entitlements: [])
            }
            if revision == ownershipRevision {
                // Serialize overlapping snapshots as well as Transaction.updates.
                // Publish before returning, so concurrent queries cannot hide a revocation
                // by silently replacing the foreground observer's baseline.
                ownershipRevision += 1
                for id in Set(currentOwnership.keys).union(lastReportedOwnership.keys) {
                    let owned = currentOwnership[id] ?? false
                    if lastReportedOwnership[id] != owned {
                        lastReportedOwnership[id] = owned
                        transactionObserver?(VerifiedEntitlementPayload(
                            productId: id, owned: owned, verified: true, transactionId: nil
                        ))
                    }
                }
                return EntitlementsQueryResult(status: "ok", verified: true, entitlements: verifiedEntries)
            }
        }

        return EntitlementsQueryResult(status: "error", verified: false, entitlements: [])
    }
}
