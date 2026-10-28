import SwiftUI

extension Color {
    /// Green when weak, through yellow, to red when very close.
    static func heat(_ strength: Double) -> Color {
        Color(hue: 0.33 * (1 - min(max(strength, 0), 1)), saturation: 0.85, brightness: 0.9)
    }
}

enum Format {
    static func distance(_ meters: Double) -> String {
        if meters < 0.3 { return "ملاصق تقريباً" }
        if meters < 10 { return String(format: "≈ %.1f م", meters) }
        return String(format: "≈ %.0f م", meters)
    }

    /// Wrapped in a left-to-right isolate so the minus sign stays in front inside Arabic text.
    static func rssi(_ value: Double) -> String {
        "\u{2066}\(Int(value.rounded())) dBm\u{2069}"
    }
}

struct SignalGauge<Center: View>: View {
    let strength: Double
    var lineWidth: CGFloat = 14
    @ViewBuilder let center: () -> Center

    var body: some View {
        ZStack {
            Circle()
                .stroke(Color.secondary.opacity(0.15), lineWidth: lineWidth)
            Circle()
                .trim(from: 0, to: max(strength, 0.001))
                .stroke(Color.heat(strength), style: StrokeStyle(lineWidth: lineWidth, lineCap: .round))
                .rotationEffect(.degrees(-90))
                .animation(.easeOut(duration: 0.25), value: strength)
            center()
        }
        .padding(lineWidth / 2)
        .environment(\.layoutDirection, .leftToRight)
    }
}

struct SignalBars: View {
    let strength: Double

    var body: some View {
        HStack(alignment: .bottom, spacing: 2) {
            ForEach(0..<4) { index in
                RoundedRectangle(cornerRadius: 1)
                    .fill(Double(index) < strength * 4 ? Color.heat(strength) : Color.secondary.opacity(0.25))
                    .frame(width: 4, height: CGFloat(5 + index * 3))
            }
        }
        .environment(\.layoutDirection, .leftToRight)
    }
}

struct DeviceRow: View {
    let device: SignalDevice
    let rangeMeters: Double

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: device.category.symbol)
                .font(.title3)
                .frame(width: 32)
                .foregroundStyle(device.category.isTracker ? Color.red : Color.accentColor)

            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 6) {
                    Text(device.displayName)
                        .font(.body.weight(.medium))
                        .lineLimit(1)
                    if device.category.isTracker {
                        Text("متتبع")
                            .font(.caption2.bold())
                            .padding(.horizontal, 6)
                            .padding(.vertical, 2)
                            .background(Color.red.opacity(0.15), in: Capsule())
                            .foregroundStyle(Color.red)
                    }
                }
                Text(subtitle)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }

            Spacer(minLength: 8)

            VStack(alignment: .trailing, spacing: 4) {
                Text(Format.distance(device.distance))
                    .font(.subheadline.weight(.semibold))
                    .monospacedDigit()
                SignalBars(strength: device.strength(rangeMeters: rangeMeters))
            }
        }
        .padding(.vertical, 2)
    }

    private var subtitle: String {
        [device.vendor, Format.rssi(device.rssi)].compactMap { $0 }.joined(separator: " · ")
    }
}
