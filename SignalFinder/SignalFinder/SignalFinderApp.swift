import SwiftUI
import UIKit

@main
struct SignalFinderApp: App {
    @StateObject private var scanner = BluetoothScanner()
    @StateObject private var beeper = BeepEngine()

    init() {
        // Arabic UI: flip UIKit-backed parts (navigation bar, lists) to right-to-left as well.
        UIView.appearance().semanticContentAttribute = .forceRightToLeft
    }

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(scanner)
                .environmentObject(beeper)
                .environment(\.layoutDirection, .rightToLeft)
        }
    }
}
