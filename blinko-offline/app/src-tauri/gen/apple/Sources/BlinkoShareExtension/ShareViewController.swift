import MobileCoreServices
import Social
import UIKit

private let appGroupId = "group.com.blinko.app"
private let pendingShareKey = "blinko_pending_share_payload"

final class ShareViewController: SLComposeServiceViewController {
  override func isContentValid() -> Bool {
    true
  }

  override func didSelectPost() {
    let baseText = contentText.trimmingCharacters(in: .whitespacesAndNewlines)

    guard let inputItems = extensionContext?.inputItems as? [NSExtensionItem] else {
      savePayload(["text": baseText])
      finish()
      return
    }

    // Prefer sharing a file if present; otherwise share text.
    for item in inputItems {
      guard let providers = item.attachments else { continue }
      for provider in providers {
        if provider.hasItemConformingToTypeIdentifier(kUTTypeFileURL as String) {
          provider.loadItem(forTypeIdentifier: kUTTypeFileURL as String, options: nil) { [weak self] item, _ in
            guard let self else { return }
            if let url = item as? URL {
              self.persistFileAndSavePayload(url: url, fallbackText: baseText)
            } else if let nsurl = item as? NSURL, let url = nsurl as URL? {
              self.persistFileAndSavePayload(url: url, fallbackText: baseText)
            } else {
              self.savePayload(["text": baseText])
              self.finish()
            }
          }
          return
        }
      }
    }

    // Text-only share.
    savePayload(["text": baseText])
    finish()
  }

  override func configurationItems() -> [Any]! {
    []
  }

  private func persistFileAndSavePayload(url: URL, fallbackText: String) {
    let fileManager = FileManager.default
    guard let container = fileManager.containerURL(forSecurityApplicationGroupIdentifier: appGroupId) else {
      savePayload(["text": fallbackText])
      finish()
      return
    }

    let inboxDir = container.appendingPathComponent("share-inbox", isDirectory: true)
    do {
      try fileManager.createDirectory(at: inboxDir, withIntermediateDirectories: true)
    } catch {
      savePayload(["text": fallbackText])
      finish()
      return
    }

    let name = url.lastPathComponent.isEmpty ? "shared_file" : url.lastPathComponent
    let dest = inboxDir.appendingPathComponent(name)

    do {
      if fileManager.fileExists(atPath: dest.path) {
        try fileManager.removeItem(at: dest)
      }
      try fileManager.copyItem(at: url, to: dest)
      savePayload([
        "text": fallbackText,
        "sharedPath": dest.path,
        "name": name,
        "content_type": "application/octet-stream",
      ])
    } catch {
      savePayload(["text": fallbackText])
    }

    finish()
  }

  private func savePayload(_ payload: [String: Any]) {
    guard let defaults = UserDefaults(suiteName: appGroupId) else { return }
    if let data = try? JSONSerialization.data(withJSONObject: payload, options: []),
       let str = String(data: data, encoding: .utf8) {
      defaults.set(str, forKey: pendingShareKey)
      defaults.synchronize()
    }
  }

  private func finish() {
    // Best-effort: try to bring Blinko to foreground.
    if let url = URL(string: "blinko://share") {
      extensionContext?.open(url, completionHandler: nil)
    }
    extensionContext?.completeRequest(returningItems: [], completionHandler: nil)
  }
}

