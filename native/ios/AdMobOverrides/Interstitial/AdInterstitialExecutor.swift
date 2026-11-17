// Derived from @capacitor-community/admob 8.3.0, MIT; see LICENSE.
import Foundation
import Capacitor
import GoogleMobileAds

class AdInterstitialExecutor: NSObject, FullScreenContentDelegate {
    weak var plugin: AdMobPlugin?
    private var preparedAds: [String: InterstitialAd] = [:]
    private var lastPreparedAdId: String?
    private var activeCall: CAPPluginCall?
    private var activeAd: InterstitialAd?
    private var activeRequestId: String?
    private var shown = false
    private var earned = false

    func prepareInterstitial(_ call: CAPPluginCall, _ request: Request, _ adUnitID: String) {
        InterstitialAd.load(
            with: adUnitID,
            request: request,
            completionHandler: { (ad, error) in
                if let error = error {
                    NSLog("Interstitial ad failed to load with error: \(error.localizedDescription)")
                    self.plugin?.notifyListeners(InterstitialAdPluginEvents.FailedToLoad.rawValue, data: [
                        "code": (error as NSError).code,
                        "message": error.localizedDescription
                    ])
                    call.reject(error.localizedDescription, String((error as NSError).code), error)
                    return
                }

                if let ad = ad {
                    ad.fullScreenContentDelegate = self
                    ad.paidEventHandler = { [weak ad] adValue in
                        guard let ad else { return }
                        let networkName = ad.responseInfo.loadedAdNetworkResponseInfo?.adNetworkClassName ?? ""
                        let impressionId = ad.responseInfo.responseIdentifier ?? ""
                        self.plugin?.notifyListeners(InterstitialAdPluginEvents.AdImpression.rawValue, data: [
                            "adUnitId": adUnitID,
                            "valueMicros": adValue.value.multiplying(byPowerOf10: 6).int64Value,
                            "currencyCode": adValue.currencyCode,
                            "precision": adValue.precision.rawValue,
                            "networkName": networkName,
                            "impressionId": impressionId
                        ])
                    }
                    self.preparedAds[adUnitID] = ad
                    self.lastPreparedAdId = adUnitID
                }
                self.plugin?.notifyListeners(InterstitialAdPluginEvents.Loaded.rawValue, data: [
                    "adUnitId": adUnitID
                ])
                call.resolve([
                    "adUnitId": adUnitID
                ])
            }
        )
    }

    func showInterstitial(_ call: CAPPluginCall) {
        guard activeCall == nil else { call.reject("An ad is already showing"); return }
        guard let requestId = call.getString("requestId"), !requestId.isEmpty,
              let adId = call.getString("adId") ?? lastPreparedAdId,
              let ad = preparedAds[adId], let controller = plugin?.getRootVC() else {
            call.reject("No prepared ad, request ID or view controller"); return
        }
        preparedAds.removeValue(forKey: adId)
        if lastPreparedAdId == adId { lastPreparedAdId = Array(preparedAds.keys).last }
        activeCall = call
        activeRequestId = requestId
        activeAd = ad
        shown = false
        earned = false
        ad.present(from: controller)
    }

    func adWillPresentFullScreenContent(_ ad: FullScreenPresentingAd) {
        guard let current = activeAd, current === (ad as AnyObject) else { return }
        shown = true
        plugin?.suspendWebMedia(for: ad)
        plugin?.notifyListeners(InterstitialAdPluginEvents.Showed.rawValue, data: ["requestId": activeRequestId ?? ""])
    }

    func ad(_ ad: FullScreenPresentingAd, didFailToPresentFullScreenContentWithError error: Error) {
        finish(ad, failed: true)
    }

    func adDidDismissFullScreenContent(_ ad: FullScreenPresentingAd) {
        finish(ad, failed: false)
    }

    private func finish(_ ad: FullScreenPresentingAd, failed: Bool) {
        guard let current = activeAd, current === (ad as AnyObject), let call = activeCall else { return }
        plugin?.resumeWebMedia(for: ad)
        // Google-served ads deliver userDidEarnRewardHandler before didDismiss.
        // Capture both in native memory, then send one terminal bridge response.
        let result: [String: Any] = [
            "protocolVersion": 1, "requestId": activeRequestId ?? "",
            "status": failed ? "error" : (earned ? "completed" : "closed"),
            "shown": shown, "closed": true,
            "reward": earned && !failed ? ["verified": true] as Any : NSNull()
        ]
        activeAd = nil
        activeCall = nil
        activeRequestId = nil
        call.resolve(result)
    }
}
