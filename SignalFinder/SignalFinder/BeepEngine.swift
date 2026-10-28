import AVFoundation
import Combine
import UIKit

/// Geiger-counter style feedback: the stronger the signal, the faster and higher the beeps.
final class BeepEngine: ObservableObject {
    @Published var soundEnabled = true
    @Published var hapticsEnabled = true

    /// Returns 0…1 while there is something to beep for, nil for silence.
    var strengthProvider: (() -> Double?)?

    private let engine = AVAudioEngine()
    private let player = AVAudioPlayerNode()
    private let format = AVAudioFormat(standardFormatWithSampleRate: 44_100, channels: 1)!
    private let haptic = UIImpactFeedbackGenerator(style: .rigid)
    private var loop: Task<Void, Never>?

    init() {
        engine.attach(player)
        engine.connect(player, to: engine.mainMixerNode, format: format)
    }

    func start() {
        guard loop == nil else { return }
        let session = AVAudioSession.sharedInstance()
        // .playback keeps beeping even when the silent switch is on.
        try? session.setCategory(.playback, options: [.mixWithOthers])
        try? session.setActive(true)
        haptic.prepare()
        loop = Task { @MainActor [weak self] in
            while !Task.isCancelled {
                let pause = self?.tick() ?? 1
                try? await Task.sleep(nanoseconds: UInt64(pause * 1_000_000_000))
            }
        }
    }

    func stop() {
        loop?.cancel()
        loop = nil
        player.stop()
        engine.stop()
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }

    /// Plays one beep for the current strength and returns how long to wait until the next one.
    private func tick() -> Double {
        guard let strength = strengthProvider?() else { return 0.2 }
        // Exponential interpolation: 1.2 s between beeps at the edge of the range, 0.05 s when touching.
        let interval = 1.2 * pow(0.05 / 1.2, strength)
        if soundEnabled {
            playBeep(frequency: 500 + 1300 * strength, duration: min(0.07, interval * 0.5))
        }
        if hapticsEnabled {
            haptic.impactOccurred(intensity: 0.4 + 0.6 * strength)
        }
        return interval
    }

    private func playBeep(frequency: Double, duration: Double) {
        // Interruptions (calls, route changes) stop the engine; bring it back on the next beep.
        if !engine.isRunning {
            do { try engine.start() } catch { return }
        }
        if !player.isPlaying { player.play() }

        let sampleRate = format.sampleRate
        let frameCount = Int(sampleRate * duration)
        guard frameCount > 0,
              let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: AVAudioFrameCount(frameCount)),
              let samples = buffer.floatChannelData?[0] else { return }
        buffer.frameLength = AVAudioFrameCount(frameCount)

        // Short fade in/out avoids clicks.
        let fade = max(1, Int(sampleRate * 0.005))
        for i in 0..<frameCount {
            let envelope = min(1, Double(i) / Double(fade), Double(frameCount - i) / Double(fade))
            samples[i] = Float(sin(2 * .pi * frequency * Double(i) / sampleRate) * envelope * 0.6)
        }
        player.scheduleBuffer(buffer, at: nil, options: .interrupts, completionHandler: nil)
    }
}
