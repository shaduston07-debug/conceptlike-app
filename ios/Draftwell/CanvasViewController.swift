import UIKit
import WebKit

/// Hosts the Draftwell drawing engine (bundled web app) full screen and bridges
/// storage, sharing, haptics and Apple Pencil interactions to it.
final class CanvasViewController: UIViewController, WKScriptMessageHandlerWithReply, WKUIDelegate, WKNavigationDelegate, UIPencilInteractionDelegate {
    private var webView: WKWebView!
    private let store = KVStore()
    private let io = DispatchQueue(label: "app.draftwell.io", qos: .userInitiated)

    override var prefersStatusBarHidden: Bool { true }
    override var prefersHomeIndicatorAutoHidden: Bool { true }
    override var preferredScreenEdgesDeferringSystemGestures: UIRectEdge { .all }

    override func loadView() {
        let config = WKWebViewConfiguration()
        let webRoot = Bundle.main.resourceURL!.appendingPathComponent("web", isDirectory: true)
        config.setURLSchemeHandler(SchemeHandler(root: webRoot), forURLScheme: "app")
        let ucc = WKUserContentController()
        ucc.addScriptMessageHandler(self, contentWorld: .page, name: "draftwell")
        ucc.addUserScript(makeStorageShim())
        config.userContentController = ucc
        config.preferences.javaScriptCanOpenWindowsAutomatically = false
        config.allowsInlineMediaPlayback = true

        let wv = WKWebView(frame: .zero, configuration: config)
        wv.isOpaque = true
        wv.backgroundColor = UIColor.systemGroupedBackground
        wv.scrollView.backgroundColor = UIColor.systemGroupedBackground
        wv.scrollView.isScrollEnabled = false
        wv.scrollView.bounces = false
        wv.scrollView.contentInsetAdjustmentBehavior = .never
        wv.scrollView.pinchGestureRecognizer?.isEnabled = false
        wv.allowsBackForwardNavigationGestures = false
        wv.allowsLinkPreview = false
        wv.uiDelegate = self
        wv.navigationDelegate = self
        if #available(iOS 16.4, *) {
            wv.isInspectable = true
        }
        webView = wv
        view = wv
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        let pencil = UIPencilInteraction()
        pencil.delegate = self
        view.addInteraction(pencil)
        webView.load(URLRequest(url: URL(string: "app://local/index.html")!))
    }

    private func makeStorageShim() -> WKUserScript {
        let snapshot = store.localStorageSnapshot()
        let json = (try? JSONSerialization.data(withJSONObject: snapshot)).flatMap { String(data: $0, encoding: .utf8) } ?? "{}"
        let source = """
        (function () {
          var data = \(json);
          function post(m) { try { window.webkit.messageHandlers.draftwell.postMessage(m); } catch (e) {} }
          var shim = {
            getItem: function (k) { k = String(k); return Object.prototype.hasOwnProperty.call(data, k) ? data[k] : null; },
            setItem: function (k, v) { k = String(k); v = String(v); data[k] = v; post({ op: 'set', key: 'ls:' + k, value: v }); },
            removeItem: function (k) { k = String(k); delete data[k]; post({ op: 'del', key: 'ls:' + k }); },
            clear: function () { Object.keys(data).forEach(function (k) { shim.removeItem(k); }); },
            key: function (i) { return Object.keys(data)[i] || null; },
            get length() { return Object.keys(data).length; }
          };
          try { Object.defineProperty(window, 'localStorage', { value: shim, configurable: true }); } catch (e) {}
          window.__draftwellNative = true;
        })();
        """
        return WKUserScript(source: source, injectionTime: .atDocumentStart, forMainFrameOnly: true)
    }

    // MARK: - Bridge

    func userContentController(_ userContentController: WKUserContentController,
                               didReceive message: WKScriptMessage,
                               replyHandler: @escaping (Any?, String?) -> Void) {
        guard let body = message.body as? [String: Any], let op = body["op"] as? String else {
            replyHandler(nil, "bad message")
            return
        }
        let key = body["key"] as? String ?? ""
        switch op {
        case "get":
            io.async {
                let v = self.store.get(key)
                DispatchQueue.main.async { replyHandler(v, nil) }
            }
        case "set":
            let value = body["value"] as? String ?? ""
            io.async {
                self.store.set(key, value)
                DispatchQueue.main.async { replyHandler(true, nil) }
            }
        case "del":
            io.async {
                self.store.delete(key)
                DispatchQueue.main.async { replyHandler(true, nil) }
            }
        case "keys":
            let prefix = body["prefix"] as? String ?? ""
            io.async {
                let k = self.store.keys(prefix: prefix)
                DispatchQueue.main.async { replyHandler(k, nil) }
            }
        case "share":
            share(name: body["name"] as? String ?? "Drawing", base64: body["data"] as? String ?? "", reply: replyHandler)
        case "photos":
            guard let b64 = body["data"] as? String, let data = Data(base64Encoded: b64), let image = UIImage(data: data) else {
                replyHandler(false, nil)
                return
            }
            UIImageWriteToSavedPhotosAlbum(image, nil, nil, nil)
            replyHandler(true, nil)
        case "haptic":
            switch body["kind"] as? String ?? "" {
            case "select": UISelectionFeedbackGenerator().selectionChanged()
            case "medium": UIImpactFeedbackGenerator(style: .medium).impactOccurred()
            default: UIImpactFeedbackGenerator(style: .light).impactOccurred()
            }
            replyHandler(true, nil)
        default:
            replyHandler(nil, "unknown op")
        }
    }

    private func share(name: String, base64: String, reply: @escaping (Any?, String?) -> Void) {
        guard let data = Data(base64Encoded: base64) else {
            reply(false, "decode failed")
            return
        }
        let safe = name.replacingOccurrences(of: "/", with: "_")
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        let url = dir.appendingPathComponent(safe)
        do {
            try data.write(to: url, options: .atomic)
        } catch {
            reply(false, error.localizedDescription)
            return
        }
        let vc = UIActivityViewController(activityItems: [url], applicationActivities: nil)
        if let pop = vc.popoverPresentationController {
            pop.sourceView = view
            pop.sourceRect = CGRect(x: view.bounds.maxX - 150, y: 64, width: 1, height: 1)
            pop.permittedArrowDirections = [.up]
        }
        vc.completionWithItemsHandler = { _, completed, _, _ in
            try? FileManager.default.removeItem(at: dir)
            reply(completed, nil)
        }
        present(vc, animated: true)
    }

    // MARK: - Apple Pencil

    func pencilInteractionDidTap(_ interaction: UIPencilInteraction) {
        webView.evaluateJavaScript("window.dispatchEvent(new Event('pencil-double-tap'))", completionHandler: nil)
    }

    @available(iOS 17.5, *)
    func pencilInteraction(_ interaction: UIPencilInteraction, didReceiveSqueeze squeeze: UIPencilInteraction.Squeeze) {
        if squeeze.phase == .ended {
            webView.evaluateJavaScript("window.dispatchEvent(new Event('pencil-squeeze'))", completionHandler: nil)
        }
    }

    // MARK: - Web view lifecycle

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        let ucc = webView.configuration.userContentController
        ucc.removeAllUserScripts()
        ucc.addUserScript(makeStorageShim())
        webView.load(URLRequest(url: URL(string: "app://local/index.html")!))
    }

    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        if let url = navigationAction.request.url, url.scheme == "app" || url.scheme == "about" || url.scheme == "blob" || url.scheme == "data" {
            decisionHandler(.allow)
        } else {
            if let url = navigationAction.request.url { UIApplication.shared.open(url) }
            decisionHandler(.cancel)
        }
    }

    // MARK: - JS dialogs (alert / confirm / prompt)

    func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping () -> Void) {
        let a = UIAlertController(title: nil, message: message, preferredStyle: .alert)
        a.addAction(UIAlertAction(title: "OK", style: .default) { _ in completionHandler() })
        present(a, animated: true)
    }

    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
        let a = UIAlertController(title: nil, message: message, preferredStyle: .alert)
        a.addAction(UIAlertAction(title: "Cancel", style: .cancel) { _ in completionHandler(false) })
        a.addAction(UIAlertAction(title: "OK", style: .default) { _ in completionHandler(true) })
        present(a, animated: true)
    }

    func webView(_ webView: WKWebView, runJavaScriptTextInputPanelWithPrompt prompt: String, defaultText: String?,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (String?) -> Void) {
        let a = UIAlertController(title: nil, message: prompt, preferredStyle: .alert)
        a.addTextField { tf in
            tf.text = defaultText
            tf.clearButtonMode = .whileEditing
        }
        a.addAction(UIAlertAction(title: "Cancel", style: .cancel) { _ in completionHandler(nil) })
        a.addAction(UIAlertAction(title: "OK", style: .default) { _ in completionHandler(a.textFields?.first?.text) })
        present(a, animated: true)
    }
}
