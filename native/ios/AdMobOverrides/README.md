# AdMob 8.3.0 iOS presentation overrides

These MIT-derived files preserve the pinned package's loading, consent and media APIs. `scripts/patch-admob-ios.mjs` validates the installed upstream version and the normalized SHA-256 of each original file before applying all replacements. `npm ci` runs it through postinstall; `npm run native:patch` repeats it. After changing an override locally, use `npm ci` to start from the known upstream files again. The check refuses unknown source variants rather than overwriting them.

The two executors keep a native request ID, a strong reference to the active ad and the pending Capacitor call. Stale delegate/reward callbacks require the same ad object. Actual display emits the request ID. A single terminal response includes protocolVersion=1, requestId, shown, closed and the SDK-earned reward, and resolves at dismissal or presentation failure. A missing root controller rejects before presentation. No JS or native timer estimates reward completion, and the JS adapter ignores raw reward/dismiss bridge events.

An ad is removed from the prepared cache immediately before presentation. Finishing that presentation never removes a replacement ad loaded under the same unit ID while it was showing.

Scope: **Google-served iOS ads only; no mediation adapters**. Google's [rewarded FAQ](https://developers.google.com/admob/ios/rewarded) says Google ads deliver every userDidEarnRewardHandler before adDidDismissFullScreenContent. Mediation order varies by network and is outside this contract. Do not enable mediation without implementing and testing a network-specific terminal contract.

`getPresentationCapabilities` allows the JS adapter to reject an unpatched native installation before SDK initialization, preload or presentation. The override keeps upstream copyright and LICENSE. Paid-event handlers use a weak ad capture to avoid a retain cycle. There is no automatic ATT request, app-open ad or new UI trigger in these overrides.

Windows checks validate source integrity, discovery and the JS contract with injected tests. **Xcode compilation, actual callbacks, audio restoration, lifecycle, privacy requirements and SDK availability still require Mac/iPhone validation.**
