import Foundation
import SwiftRs
import Tauri
import UIKit
import WebKit

private let appGroupId = "group.com.blinko.app"
private let pendingShareKey = "blinko_pending_share_payload"

struct SetColorArgs: Decodable {
  let hex: String
}

struct PresentShareSheetArgs: Decodable {
  let path: String
  let mime: String?
  let filename: String?
}

class BlinkoPlugin: Plugin {

  @objc public func setcolor(_ invoke: Invoke) throws {
    _ = try invoke.parseArgs(SetColorArgs.self)
    // iOS: status bar color is not directly configurable like Android; no-op.
    invoke.resolve()
  }

  @objc public func openAppSettings(_ invoke: Invoke) throws {
    DispatchQueue.main.async {
      if let url = URL(string: UIApplication.openSettingsURLString) {
        UIApplication.shared.open(url, options: [:], completionHandler: nil)
      }
    }
    invoke.resolve()
  }

  @objc public func presentShareSheet(_ invoke: Invoke) throws {
    let args = try invoke.parseArgs(PresentShareSheetArgs.self)
    let path = args.path.trimmingCharacters(in: .whitespacesAndNewlines)
    if path.isEmpty {
      invoke.reject("path is required")
      return
    }

    let fileUrl = URL(fileURLWithPath: path)
    DispatchQueue.main.async {
      let controller = UIActivityViewController(activityItems: [fileUrl], applicationActivities: nil)
      controller.popoverPresentationController?.sourceView = self.manager.viewController?.view
      self.manager.viewController?.present(controller, animated: true)
    }
    invoke.resolve()
  }

  @objc public func getPendingSharePayload(_ invoke: Invoke) throws {
    let defaults = UserDefaults(suiteName: appGroupId)
    guard let raw = defaults?.string(forKey: pendingShareKey), !raw.isEmpty else {
      invoke.resolve(["payload": nil])
      return
    }

    let payload = consumeSharedFileIfNeeded(raw)
    invoke.resolve(["payload": payload])
  }

  @objc public func clearPendingSharePayload(_ invoke: Invoke) throws {
    let defaults = UserDefaults(suiteName: appGroupId)
    defaults?.removeObject(forKey: pendingShareKey)
    defaults?.synchronize()
    invoke.resolve()
  }

  private func consumeSharedFileIfNeeded(_ raw: String) -> String {
    guard let data = raw.data(using: .utf8),
          var obj = (try? JSONSerialization.jsonObject(with: data, options: [])) as? [String: Any] else {
      return raw
    }

    guard let sharedPath = obj["sharedPath"] as? String, !sharedPath.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
      return raw
    }

    let fileManager = FileManager.default
    let sourceUrl = URL(fileURLWithPath: sharedPath)
    let name = (obj["name"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines)
    let safeName = (name?.isEmpty == false) ? name! : (sourceUrl.lastPathComponent.isEmpty ? "shared_file" : sourceUrl.lastPathComponent)

    guard let appSupport = fileManager.urls(for: .applicationSupportDirectory, in: .userDomainMask).first else {
      return raw
    }

    let destDir = appSupport.appendingPathComponent("blinko/share-inbox", isDirectory: true)
    do {
      try fileManager.createDirectory(at: destDir, withIntermediateDirectories: true)
      let destUrl = destDir.appendingPathComponent(safeName)
      if fileManager.fileExists(atPath: destUrl.path) {
        try fileManager.removeItem(at: destUrl)
      }
      try fileManager.copyItem(at: sourceUrl, to: destUrl)
      obj["localPath"] = destUrl.path
      obj.removeValue(forKey: "sharedPath")
      // Best-effort cleanup of the shared inbox file.
      try? fileManager.removeItem(at: sourceUrl)
      let out = try JSONSerialization.data(withJSONObject: obj, options: [])
      return String(data: out, encoding: .utf8) ?? raw
    } catch {
      return raw
    }
  }
}

@_cdecl("init_plugin_blinko")
func initPlugin() -> Plugin {
  return BlinkoPlugin()
}
