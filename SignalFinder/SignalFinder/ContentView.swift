import CoreBluetooth
import SwiftUI
import UIKit

struct ContentView: View {
    @EnvironmentObject private var scanner: BluetoothScanner
    @EnvironmentObject private var beeper: BeepEngine
    @Environment(\.scenePhase) private var scenePhase

    var body: some View {
        NavigationStack {
            List {
                if let warning = bluetoothWarning {
                    Section {
                        Label(warning, systemImage: "exclamationmark.triangle.fill")
                            .foregroundStyle(Color.orange)
                        if scanner.state == .unauthorized {
                            Button("فتح الإعدادات") { openSettings() }
                        }
                    }
                }

                Section {
                    SweepHeader(target: scanner.isActive ? scanner.inRange.first : nil,
                                rangeMeters: scanner.rangeMeters,
                                isActive: scanner.isActive)
                }

                Section {
                    VStack(alignment: .leading, spacing: 6) {
                        Text("المدى: \(Int(scanner.rangeMeters)) م")
                        Slider(value: $scanner.rangeMeters, in: 1...20, step: 1)
                    }
                    Toggle("صوت", isOn: $beeper.soundEnabled)
                    Toggle("اهتزاز", isOn: $beeper.hapticsEnabled)
                } header: {
                    Text("الإعدادات")
                }

                Section {
                    if scanner.inRange.isEmpty {
                        Text(scanner.isActive ? "ما في أجهزة ضمن المدى حالياً" : "الفحص متوقف")
                            .foregroundStyle(.secondary)
                    }
                    ForEach(scanner.inRange) { device in
                        NavigationLink(value: device.id) {
                            DeviceRow(device: device, rangeMeters: scanner.rangeMeters)
                        }
                        .swipeActions {
                            Button("تجاهل") { scanner.ignore(device.id) }
                                .tint(Color.gray)
                        }
                    }
                } header: {
                    Text("ضمن \(Int(scanner.rangeMeters)) م (\(scanner.inRange.count))")
                } footer: {
                    VStack(alignment: .leading, spacing: 6) {
                        if scanner.outOfRangeCount > 0 {
                            Text("و \(scanner.outOfRangeCount) أجهزة أبعد من المدى.")
                        }
                        Text("اضغط على جهاز لتتبعه وحده. اسحب لتجاهل أجهزتك أنت.")
                        if !scanner.ignoredIDs.isEmpty {
                            Button("إظهار الأجهزة المتجاهلة (\(scanner.ignoredIDs.count))") {
                                scanner.clearIgnored()
                            }
                            .font(.footnote)
                        }
                    }
                }
            }
            .navigationTitle("كاشف الإشارات")
            .toolbar {
                ToolbarItem(placement: .primaryAction) {
                    Button(scanner.isActive ? "إيقاف" : "تشغيل") {
                        setActive(!scanner.isActive)
                    }
                }
            }
            .navigationDestination(for: UUID.self) { id in
                TrackView(deviceID: id)
            }
        }
        .onAppear {
            let scanner = self.scanner
            beeper.strengthProvider = { scanner.beepStrength() }
            setActive(true)
        }
        .onChange(of: scenePhase) { phase in
            if phase == .background {
                beeper.stop()
            } else if phase == .active, scanner.isActive {
                beeper.start()
            }
        }
    }

    private var bluetoothWarning: String? {
        switch scanner.state {
        case .poweredOff: return "البلوتوث مطفي. شغّله من مركز التحكم أو من الإعدادات."
        case .unauthorized: return "التطبيق ما عنده إذن يستخدم البلوتوث."
        case .unsupported: return "هالجهاز ما بيدعم Bluetooth LE."
        default: return nil
        }
    }

    private func setActive(_ active: Bool) {
        if active {
            scanner.start()
            beeper.start()
        } else {
            scanner.stop()
            beeper.stop()
        }
        // Keep the screen on while searching, since iOS stops scanning in the background.
        UIApplication.shared.isIdleTimerDisabled = active
    }

    private func openSettings() {
        if let url = URL(string: UIApplication.openSettingsURLString) {
            UIApplication.shared.open(url)
        }
    }
}

private struct SweepHeader: View {
    let target: SignalDevice?
    let rangeMeters: Double
    let isActive: Bool

    var body: some View {
        HStack(spacing: 16) {
            SignalGauge(strength: target?.strength(rangeMeters: rangeMeters) ?? 0, lineWidth: 10) {
                Image(systemName: target?.category.symbol ?? "antenna.radiowaves.left.and.right")
                    .font(.title2)
                    .foregroundStyle(target == nil ? Color.secondary : Color.heat(target?.strength(rangeMeters: rangeMeters) ?? 0))
            }
            .frame(width: 84, height: 84)

            VStack(alignment: .leading, spacing: 4) {
                if !isActive {
                    Text("الفحص متوقف").font(.headline)
                    Text("اضغط «تشغيل» لتبدأ").font(.subheadline).foregroundStyle(.secondary)
                } else if let target {
                    Text("أقوى إشارة").font(.caption).foregroundStyle(.secondary)
                    Text(target.displayName).font(.headline).lineLimit(1)
                    Text(Format.distance(target.distance)).font(.subheadline).monospacedDigit()
                } else {
                    Text("عم دوّر…").font(.headline)
                    Text("ما في شي ضمن \(Int(rangeMeters)) م").font(.subheadline).foregroundStyle(.secondary)
                }
            }
            Spacer(minLength: 0)
        }
        .padding(.vertical, 6)
    }
}
