import SwiftUI
import UIKit

/// Follows a single device: the beeps now only react to this one signal.
struct TrackView: View {
    let deviceID: UUID
    @EnvironmentObject private var scanner: BluetoothScanner

    var body: some View {
        let device = scanner.device(with: deviceID)
        let isLost = device.map { $0.isStale(at: Date()) } ?? true
        let strength = isLost ? 0 : (device?.strength(rangeMeters: scanner.rangeMeters) ?? 0)

        ScrollView {
            VStack(spacing: 24) {
                SignalGauge(strength: strength, lineWidth: 22) {
                    VStack(spacing: 4) {
                        Text(isLost ? "—" : "\(Int((strength * 100).rounded()))%")
                            .font(.system(size: 54, weight: .bold, design: .rounded))
                            .monospacedDigit()
                        Text(isLost ? "ضاعت الإشارة" : Format.distance(device?.distance ?? 0))
                            .font(.title3)
                            .foregroundStyle(.secondary)
                    }
                }
                .frame(width: 260, height: 260)
                .padding(.top, 12)

                TrendLabel(trend: device?.trend ?? 0, isLost: isLost)

                if let device {
                    VStack(spacing: 10) {
                        InfoRow(title: "الاسم", value: device.displayName)
                        InfoRow(title: "النوع", value: device.category.label ?? "غير معروف")
                        InfoRow(title: "الشركة", value: device.vendor ?? "غير معروفة")
                        InfoRow(title: "قوة الإشارة", value: Format.rssi(device.rssi))
                        InfoRow(title: "قابل للاتصال", value: device.isConnectable ? "نعم" : "لا")
                    }
                    .padding()
                    .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 14))
                }

                Text("امشِ ببطء ولفّ حوالين حالك. كل ما صار الطنين أسرع والصوت أعلى، يعني قرّبت. جسمك بيحجب الإشارة، فجرّب تمسك الموبايل بعيد عنك وتوجّهه بكل الاتجاهات.")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.leading)
            }
            .padding()
        }
        .background(Color(.systemGroupedBackground))
        .navigationTitle(device?.displayName ?? "تتبع")
        .navigationBarTitleDisplayMode(.inline)
        .onAppear { scanner.trackedID = deviceID }
        .onDisappear {
            if scanner.trackedID == deviceID { scanner.trackedID = nil }
        }
    }
}

private struct TrendLabel: View {
    let trend: Double
    let isLost: Bool

    var body: some View {
        Label(text, systemImage: symbol)
            .font(.title3.weight(.semibold))
            .foregroundStyle(color)
            .animation(.default, value: text)
    }

    private var text: String {
        if isLost { return "الجهاز ما عم يبعت إشارة" }
        if trend > 1.5 { return "عم تقرّب" }
        if trend < -1.5 { return "عم تبعد" }
        return "ثابت"
    }

    private var symbol: String {
        if isLost { return "antenna.radiowaves.left.and.right.slash" }
        if trend > 1.5 { return "arrow.up.circle.fill" }
        if trend < -1.5 { return "arrow.down.circle.fill" }
        return "equal.circle.fill"
    }

    private var color: Color {
        if isLost { return Color.secondary }
        if trend > 1.5 { return Color.green }
        if trend < -1.5 { return Color.blue }
        return Color.secondary
    }
}

private struct InfoRow: View {
    let title: String
    let value: String

    var body: some View {
        HStack {
            Text(title).foregroundStyle(.secondary)
            Spacer()
            Text(value).fontWeight(.medium).lineLimit(1)
        }
        .font(.subheadline)
    }
}
