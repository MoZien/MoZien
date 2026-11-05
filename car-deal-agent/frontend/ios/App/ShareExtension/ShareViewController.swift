import UIKit
import UniformTypeIdentifiers
import UserNotifications

/// "Teilen" → AutoHalle on the iPhone. Apple doesn't let a share extension open its own app, so this
/// hands the shared ad over with a notification: tapping it opens AutoHalle on the check (the app
/// reads the link from `cap_extra`, see src/lib/share.ts). Without permission for notifications it
/// copies the link and says how to go on.
final class ShareViewController: UIViewController {
    private var started = false

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        guard !started else { return }
        started = true
        Task { @MainActor in await handOver() }
    }

    @MainActor
    private func handOver() async {
        guard let shared = await sharedText() else { return finish() }
        let center = UNUserNotificationCenter.current()
        let settings = await center.notificationSettings()
        if settings.authorizationStatus == .authorized || settings.authorizationStatus == .provisional {
            let content = UNMutableNotificationContent()
            content.title = "AutoHalle"
            content.body = "Tippe hier, um das Auto zu prüfen."
            content.sound = .default
            content.userInfo = ["cap_extra": ["url": shared]]
            let request = UNNotificationRequest(identifier: UUID().uuidString, content: content, trigger: nil)
            do {
                try await center.add(request)
                return finish()
            } catch {
                // fall through to copy & paste
            }
        }
        UIPasteboard.general.string = shared
        let alert = UIAlertController(
            title: "Link kopiert",
            message: "Öffne AutoHalle und tippe auf „Einfügen“. Tipp: Erlaube AutoHalle Mitteilungen – dann reicht künftig ein Tipp.",
            preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "OK", style: .default) { _ in self.finish() })
        present(alert, animated: true)
    }

    private func finish() {
        extensionContext?.completeRequest(returningItems: nil)
    }

    /// The shared link (Safari, AutoScout24, Autohero) or text with a link (Kleinanzeigen shares text).
    private func sharedText() async -> String? {
        let providers = (extensionContext?.inputItems as? [NSExtensionItem] ?? []).flatMap { $0.attachments ?? [] }
        for provider in providers where provider.hasItemConformingToTypeIdentifier(UTType.url.identifier) {
            if let url = try? await provider.loadItem(forTypeIdentifier: UTType.url.identifier) as? URL {
                return url.absoluteString
            }
        }
        for provider in providers where provider.hasItemConformingToTypeIdentifier(UTType.plainText.identifier) {
            if let text = try? await provider.loadItem(forTypeIdentifier: UTType.plainText.identifier) as? String,
               !text.isEmpty {
                return text
            }
        }
        return nil
    }
}
