import CoreBluetooth
import Foundation

/// Log-distance path-loss model. RSSI is noisy (walls, bodies, reflections),
/// so the distance is only a rough guide — the trend (closer/further) is what matters.
enum SignalMath {
    /// Typical RSSI of a BLE device at 1 m.
    static let defaultMeasuredPower = -59.0
    /// Path-loss exponent: 2 in free space, 2–3 indoors.
    static let pathLossExponent = 2.2
    /// Distance that counts as "touching" (full strength).
    static let nearDistance = 0.1

    static func distance(rssi: Double, measuredPower: Double) -> Double {
        pow(10, (measuredPower - rssi) / (10 * pathLossExponent))
    }

    static func expectedRSSI(atMeters meters: Double, measuredPower: Double) -> Double {
        measuredPower - 10 * pathLossExponent * log10(meters)
    }

    /// 0 at the edge of the range, 1 when (almost) touching the device.
    static func strength(rssi: Double, measuredPower: Double, rangeMeters: Double) -> Double {
        let far = expectedRSSI(atMeters: rangeMeters, measuredPower: measuredPower)
        let near = expectedRSSI(atMeters: nearDistance, measuredPower: measuredPower)
        return min(max((rssi - far) / (near - far), 0), 1)
    }
}

struct SignalDevice: Identifiable {
    let id: UUID
    var name: String?
    var vendor: String?
    var category: DeviceCategory = .unknown
    var isConnectable = false
    var measuredPower = SignalMath.defaultMeasuredPower
    private(set) var rawRSSI: Int
    private(set) var fastRSSI: Double
    private(set) var slowRSSI: Double
    private(set) var lastSeen: Date

    init(id: UUID, rssi: Int, at date: Date) {
        self.id = id
        rawRSSI = rssi
        fastRSSI = Double(rssi)
        slowRSSI = Double(rssi)
        lastSeen = date
    }

    /// Smoothed RSSI used for display and beeping.
    var rssi: Double { fastRSSI }
    /// Positive while the signal gets stronger (moving closer), negative while it fades.
    var trend: Double { fastRSSI - slowRSSI }
    var distance: Double { SignalMath.distance(rssi: rssi, measuredPower: measuredPower) }

    func strength(rangeMeters: Double) -> Double {
        SignalMath.strength(rssi: rssi, measuredPower: measuredPower, rangeMeters: rangeMeters)
    }

    func isInRange(_ rangeMeters: Double) -> Bool { distance <= rangeMeters }

    func isStale(at date: Date) -> Bool { date.timeIntervalSince(lastSeen) > 3 }

    var displayName: String {
        if let name, !name.isEmpty { return name }
        if let label = category.label { return label }
        if let vendor { return "جهاز \(vendor)" }
        return "جهاز غير معروف"
    }

    /// Time-based exponential smoothing, so devices that advertise often and rarely behave the same.
    mutating func record(rssi: Int, at date: Date) {
        let dt = max(date.timeIntervalSince(lastSeen), 0.01)
        fastRSSI += (1 - exp(-dt / 0.7)) * (Double(rssi) - fastRSSI)
        slowRSSI += (1 - exp(-dt / 3.0)) * (Double(rssi) - slowRSSI)
        rawRSSI = rssi
        lastSeen = date
    }

    mutating func apply(advertisement data: [String: Any], peripheralName: String?) {
        // Advertisements and scan responses alternate, so only overwrite what is actually present.
        if let localName = data[CBAdvertisementDataLocalNameKey] as? String, !localName.isEmpty {
            name = localName
        } else if let peripheralName, !peripheralName.isEmpty {
            name = peripheralName
        }
        if let connectable = data[CBAdvertisementDataIsConnectable] as? NSNumber {
            isConnectable = connectable.boolValue
        }
        if let txPower = data[CBAdvertisementDataTxPowerLevelKey] as? NSNumber {
            // Advertised TX power is at 0 m; free-space loss to 1 m at 2.4 GHz is about 41 dB.
            measuredPower = min(max(txPower.doubleValue - 41, -75), -45)
        }

        let services = (data[CBAdvertisementDataServiceUUIDsKey] as? [CBUUID] ?? [])
            + ((data[CBAdvertisementDataServiceDataKey] as? [CBUUID: Data])?.keys.map { $0 } ?? [])
        let manufacturer = (data[CBAdvertisementDataManufacturerDataKey] as? Data).map { [UInt8]($0) }
        if let manufacturer, manufacturer.count >= 2 {
            let companyID = UInt16(manufacturer[0]) | UInt16(manufacturer[1]) << 8
            vendor = BluetoothVendors.name(for: companyID) ?? vendor
        }

        let detected = DeviceCategory.detect(services: services, manufacturer: manufacturer, name: name)
        if detected != .unknown { category = detected }
    }
}

enum DeviceCategory: Equatable {
    case unknown
    case tracker(String)
    case audio
    case phone
    case computer
    case watch
    case input
    case health
    case tv

    var isTracker: Bool {
        if case .tracker = self { return true }
        return false
    }

    var label: String? {
        switch self {
        case .unknown: return nil
        case .tracker(let kind): return kind
        case .audio: return "سماعات / سماعة"
        case .phone: return "هاتف / جهاز لوحي"
        case .computer: return "كمبيوتر"
        case .watch: return "ساعة / سوار ذكي"
        case .input: return "لوحة مفاتيح / ماوس"
        case .health: return "حساس صحي"
        case .tv: return "تلفزيون"
        }
    }

    var symbol: String {
        switch self {
        case .unknown: return "antenna.radiowaves.left.and.right"
        case .tracker: return "location.circle.fill"
        case .audio: return "headphones"
        case .phone: return "iphone"
        case .computer: return "laptopcomputer"
        case .watch: return "applewatch"
        case .input: return "keyboard"
        case .health: return "heart.fill"
        case .tv: return "tv"
        }
    }

    static func detect(services: [CBUUID], manufacturer: [UInt8]?, name: String?) -> DeviceCategory {
        let ids = Set(services.map { $0.uuidString.uppercased() })

        // Item trackers
        if ids.contains("FCB2") { return .tracker("متتبع موقع") }
        if ids.contains("FEED") || ids.contains("FEEC") { return .tracker("Tile") }
        if ids.contains("FD5A") { return .tracker("Samsung SmartTag") }

        // Apple continuity messages: company 0x004C followed by a message type byte
        if let bytes = manufacturer, bytes.count >= 3, bytes[0] == 0x4C, bytes[1] == 0x00 {
            switch bytes[2] {
            case 0x12: return .tracker("AirTag / Find My")
            case 0x07: return .audio
            case 0x10, 0x0C: return .phone
            default: break
            }
        }

        if ids.contains("180D") { return .health }
        if ids.contains("1812") { return .input }

        let lowered = name?.lowercased() ?? ""
        func has(_ words: [String]) -> Bool { words.contains { lowered.contains($0) } }
        if has(["airpods", "buds", "beats", "jbl", "bose", "headphone", "speaker", "wh-", "wf-"]) { return .audio }
        if has(["watch", "band", "fitbit", "garmin", "amazfit"]) { return .watch }
        if has(["iphone", "ipad", "galaxy", "pixel", "phone"]) { return .phone }
        if has(["macbook", "imac", "laptop", "desktop"]) { return .computer }
        if has(["keyboard", "mouse", "trackpad"]) { return .input }
        if has(["tv", "bravia", "fire stick", "chromecast"]) { return .tv }
        return .unknown
    }
}

enum BluetoothVendors {
    // Subset of the Bluetooth SIG company identifiers.
    private static let names: [UInt16: String] = [
        0x0002: "Intel",
        0x0006: "Microsoft",
        0x000F: "Broadcom",
        0x004C: "Apple",
        0x0057: "Harman",
        0x0059: "Nordic Semiconductor",
        0x0075: "Samsung",
        0x0087: "Garmin",
        0x009E: "Bose",
        0x00C4: "LG",
        0x00E0: "Google",
        0x012D: "Sony",
        0x0131: "Cypress",
        0x0157: "Amazfit",
        0x0171: "Amazon",
        0x027D: "Huawei",
        0x02E5: "Espressif",
        0x038F: "Xiaomi",
        0x0499: "Ruuvi",
    ]

    static func name(for companyID: UInt16) -> String? { names[companyID] }
}
