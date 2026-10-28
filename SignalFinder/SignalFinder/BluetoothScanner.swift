import Combine
import CoreBluetooth
import Foundation

/// Scans for BLE advertisements and keeps a smoothed RSSI per device.
/// iOS gives third-party apps no access to Wi-Fi scanning, classic Bluetooth or raw radio,
/// so Bluetooth Low Energy is the only signal source available here.
final class BluetoothScanner: NSObject, ObservableObject {
    @Published private(set) var devices: [SignalDevice] = []
    @Published private(set) var state: CBManagerState = .unknown
    @Published private(set) var isActive = false
    @Published var rangeMeters: Double = 10
    @Published var trackedID: UUID?
    @Published private(set) var ignoredIDs: Set<UUID> = []

    private var central: CBCentralManager!
    private var seen: [UUID: SignalDevice] = [:]
    private var refreshTimer: Timer?

    override init() {
        super.init()
        // nil queue: delegate callbacks arrive on the main thread, same as the UI.
        central = CBCentralManager(delegate: self, queue: nil)
    }

    var inRange: [SignalDevice] {
        devices.filter { $0.isInRange(rangeMeters) && !ignoredIDs.contains($0.id) }
    }

    var outOfRangeCount: Int {
        devices.filter { !$0.isInRange(rangeMeters) && !ignoredIDs.contains($0.id) }.count
    }

    func device(with id: UUID) -> SignalDevice? {
        devices.first { $0.id == id }
    }

    /// The device the beeper follows: the tracked one, otherwise the strongest one in range.
    var target: SignalDevice? {
        if let trackedID { return device(with: trackedID) }
        return inRange.first
    }

    /// Beep strength from 0 (edge of range) to 1 (touching), or nil when there is nothing to beep for.
    func beepStrength(at date: Date = Date()) -> Double? {
        guard isActive, state == .poweredOn, let target, !target.isStale(at: date) else { return nil }
        // Sweep mode only beeps for devices inside the range; tracking keeps beeping slowly when far away.
        if trackedID == nil, !target.isInRange(rangeMeters) { return nil }
        return target.strength(rangeMeters: rangeMeters)
    }

    func start() {
        isActive = true
        beginScanIfPossible()
        refreshTimer?.invalidate()
        refreshTimer = Timer.scheduledTimer(withTimeInterval: 0.25, repeats: true) { [weak self] _ in
            self?.refresh()
        }
    }

    func stop() {
        isActive = false
        refreshTimer?.invalidate()
        refreshTimer = nil
        if central.state == .poweredOn { central.stopScan() }
    }

    func ignore(_ id: UUID) {
        ignoredIDs.insert(id)
    }

    func clearIgnored() {
        ignoredIDs.removeAll()
    }

    private func beginScanIfPossible() {
        guard isActive, central.state == .poweredOn, !central.isScanning else { return }
        // Allowing duplicates keeps RSSI updates flowing for every advertisement (foreground only).
        central.scanForPeripherals(withServices: nil, options: [CBCentralManagerScanOptionAllowDuplicatesKey: true])
    }

    /// Advertisements arrive many times per second; publishing a snapshot at 4 Hz keeps SwiftUI calm.
    private func refresh() {
        let now = Date()
        seen = seen.filter { $0.key == trackedID || now.timeIntervalSince($0.value.lastSeen) < 10 }
        devices = seen.values.sorted { $0.rssi > $1.rssi }
    }
}

extension BluetoothScanner: CBCentralManagerDelegate {
    func centralManagerDidUpdateState(_ central: CBCentralManager) {
        state = central.state
        if central.state == .poweredOn { beginScanIfPossible() }
    }

    func centralManager(
        _ central: CBCentralManager,
        didDiscover peripheral: CBPeripheral,
        advertisementData: [String: Any],
        rssi RSSI: NSNumber
    ) {
        let rssi = RSSI.intValue
        guard rssi < 0 else { return } // 127 means "RSSI not available"
        let now = Date()
        var device = seen[peripheral.identifier] ?? SignalDevice(id: peripheral.identifier, rssi: rssi, at: now)
        device.record(rssi: rssi, at: now)
        device.apply(advertisement: advertisementData, peripheralName: peripheral.name)
        seen[peripheral.identifier] = device
    }
}
