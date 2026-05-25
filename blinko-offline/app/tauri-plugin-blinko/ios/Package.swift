// swift-tools-version:5.3
import PackageDescription

let package = Package(
  name: "tauri-plugin-blinko",
  platforms: [
    .macOS(.v10_13),
    .iOS(.v13),
  ],
  products: [
    .library(
      name: "tauri-plugin-blinko",
      type: .static,
      targets: ["tauri-plugin-blinko"])
  ],
  dependencies: [
    .package(name: "Tauri", path: "../.tauri/tauri-api")
  ],
  targets: [
    .target(
      name: "tauri-plugin-blinko",
      dependencies: [
        .byName(name: "Tauri")
      ],
      path: "Sources")
  ]
)

