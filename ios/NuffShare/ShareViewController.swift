import SwiftUI
import UIKit
import UniformTypeIdentifiers

// MARK: - Constants

private let apiBase = URL(string: "https://nuff-kakao-ingress.cksrowldms9-475.workers.dev")!

/// Brand orange: #FF6B35 — used as the primary accent throughout the extension.
private let brandOrange = Color(red: 1.0, green: 0.42, blue: 0.21)

// MARK: - ShareViewController (Host)

/// The root view controller for the Nuff Share Extension.
///
/// Design decisions:
/// - Inherits from UIViewController (not SLComposeServiceViewController) so we can
///   use a fully custom SwiftUI interface via UIHostingController.
/// - Input loading runs immediately in viewDidLoad to minimize perceived latency.
/// - The background is made transparent so the system share-sheet chrome shows through,
///   giving a native feel.
final class ShareViewController: UIViewController {

    override func viewDidLoad() {
        super.viewDidLoad()

        // Make the host view background clear so the system dimming layer is visible.
        view.backgroundColor = .clear

        Task { @MainActor [weak self] in
            guard let self else { return }
            let input = await loadInput()

            let rootView = ShareRootView(input: input) { [weak self] success in
                guard let context = self?.extensionContext else { return }
                if success {
                    context.completeRequest(returningItems: nil)
                } else {
                    let error = NSError(domain: NSCocoaErrorDomain, code: NSUserCancelledError)
                    context.cancelRequest(withError: error)
                }
            }

            let host = UIHostingController(rootView: rootView)
            host.view.backgroundColor = .clear
            addChild(host)
            host.view.frame = view.bounds
            host.view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
            view.addSubview(host.view)
            host.didMove(toParent: self)
        }
    }

    // MARK: Input Loading

    /// Extracts the shared URL or pairing code from the extension input items.
    ///
    /// Priority order:
    /// 1. A typed URL attachment (covers Safari, most apps)
    /// 2. Plain-text containing a NUFF-CONNECT: pairing code
    /// 3. Plain-text containing an https?:// URL (KakaoTalk, Instagram, etc.)
    ///
    /// This approach handles the widest variety of source apps without
    /// relying on any single type identifier.
    @MainActor
    private func loadInput() async -> String? {
        guard let items = extensionContext?.inputItems as? [NSExtensionItem] else { return nil }

        let attachments = items.compactMap(\.attachments).flatMap { $0 }

        for attachment in attachments {
            // 1) URL type — most reliable for Safari and standard share sources.
            if attachment.hasItemConformingToTypeIdentifier(UTType.url.identifier),
               let url = try? await attachment.loadItem(forTypeIdentifier: UTType.url.identifier) as? URL {
                return url.absoluteString
            }

            // 2) Plain text — covers KakaoTalk text shares and the pairing protocol.
            if attachment.hasItemConformingToTypeIdentifier(UTType.plainText.identifier),
               let text = try? await attachment.loadItem(forTypeIdentifier: UTType.plainText.identifier) as? String {
                // Pairing code passthrough
                if text.hasPrefix("NUFF-CONNECT:") { return text }
                // Extract first URL from text blob
                if let match = text.firstMatch(of: /https?:\/\/\S+/) {
                    return String(match.output)
                }
            }
        }
        return nil
    }
}

// MARK: - View State Machine

/// Represents the share flow's discrete states.
/// Using an enum keeps the view body declarative and prevents impossible state combinations.
private enum SharePhase: Equatable {
    case idle
    case loading
    case success(message: String, todayCount: Int?)
    case error(message: String)
    case pairingSuccess(message: String)
}

// MARK: - ShareRootView

private struct ShareRootView: View {

    let input: String?
    let done: (Bool) -> Void

    @State private var phase: SharePhase = .idle
    @State private var token = UserDefaults.standard.string(forKey: "nuffDeviceToken")

    /// Tracks whether the initial perform() has been called.
    @State private var hasAttempted = false

    /// Controls the checkmark scale-up animation on success.
    @State private var showCheckmark = false

    /// Whether the input is a pairing handshake, not a regular save.
    private var isConnecting: Bool { input?.hasPrefix("NUFF-CONNECT:") == true }

    // MARK: Body

    var body: some View {
        ZStack {
            // Semi-transparent background that matches system share-sheet feel.
            Color.black.opacity(0.001) // catches taps
                .ignoresSafeArea()
                .onTapGesture { done(phase.isSuccess) }

            VStack(spacing: 0) {
                Spacer()
                cardContent
                    .padding(.horizontal, 20)
                    .padding(.bottom, 34)
            }
        }
        .task {
            guard !hasAttempted else { return }
            hasAttempted = true
            await perform()
        }
    }

    // MARK: Card

    /// The floating card that contains the share UI.
    ///
    /// Design decisions:
    /// - 18pt corner radius matches the Nuff brand language.
    /// - Uses `.systemBackground` for automatic dark mode.
    /// - Generous 24pt internal padding for touch-friendly spacing.
    /// - Drop shadow gives depth without feeling heavy.
    private var cardContent: some View {
        VStack(spacing: 20) {
            // Drag indicator — mirrors native sheet behavior.
            Capsule()
                .fill(Color.secondary.opacity(0.3))
                .frame(width: 36, height: 5)
                .padding(.top, 8)

            // Header row: title + close button.
            HStack {
                Text(isConnecting ? "공유 준비" : "Nuff에 저장")
                    .font(.headline)
                Spacer()
                Button { done(phase.isSuccess) } label: {
                    Image(systemName: "xmark.circle.fill")
                        .font(.title2)
                        .foregroundStyle(.secondary)
                }
                .accessibilityLabel("닫기")
            }

            // Dynamic content based on current phase.
            phaseContent
        }
        .padding(.horizontal, 24)
        .padding(.bottom, 24)
        .background(
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .fill(Color(uiColor: .systemBackground))
                .shadow(color: .black.opacity(0.15), radius: 20, y: 10)
        )
    }

    // MARK: Phase Content

    @ViewBuilder
    private var phaseContent: some View {
        switch phase {
        case .idle:
            // Brief idle state; practically never visible because .task fires immediately.
            loadingView(message: isConnecting ? "준비 중…" : "저장 중…")

        case .loading:
            loadingView(message: isConnecting ? "내 보관함과 연결 중…" : "저장 중…")

        case .success(let message, let todayCount):
            successView(message: message, todayCount: todayCount)

        case .pairingSuccess(let message):
            pairingSuccessView(message: message)

        case .error(let message):
            errorView(message: message)
        }
    }

    // MARK: Loading

    private func loadingView(message: String) -> some View {
        VStack(spacing: 16) {
            ProgressView()
                .controlSize(.large)
                .tint(brandOrange)
            Text(message)
                .font(.subheadline)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 20)
    }

    // MARK: Success

    /// Success state for regular link saves.
    ///
    /// Design decisions:
    /// - Animated checkmark with spring scale gives satisfying tactile feedback.
    /// - Today's save count provides a gentle gamification nudge.
    /// - Auto-dismiss after 1.5s keeps the user in their flow.
    private func successView(message: String, todayCount: Int?) -> some View {
        VStack(spacing: 14) {
            Image(systemName: "checkmark.circle.fill")
                .font(.system(size: 52))
                .foregroundStyle(brandOrange)
                .scaleEffect(showCheckmark ? 1.0 : 0.3)
                .opacity(showCheckmark ? 1.0 : 0.0)
                .animation(.spring(response: 0.4, dampingFraction: 0.6), value: showCheckmark)

            Text(message)
                .font(.subheadline.weight(.medium))
                .multilineTextAlignment(.center)

            if let count = todayCount, count > 0 {
                Text("오늘 \(count)개 저장")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 5)
                    .background(
                        Capsule().fill(brandOrange.opacity(0.12))
                    )
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 12)
        .onAppear {
            // Trigger the checkmark animation shortly after appearing.
            withAnimation { showCheckmark = true }
            // Haptic feedback — UINotificationFeedbackGenerator for satisfying success tap.
            let generator = UINotificationFeedbackGenerator()
            generator.notificationOccurred(.success)
            // Auto-dismiss after 1.5 seconds to keep the user in flow.
            DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) {
                done(true)
            }
        }
    }

    // MARK: Pairing Success

    private func pairingSuccessView(message: String) -> some View {
        VStack(spacing: 14) {
            Image(systemName: "link.circle.fill")
                .font(.system(size: 52))
                .foregroundStyle(.green)
                .scaleEffect(showCheckmark ? 1.0 : 0.3)
                .opacity(showCheckmark ? 1.0 : 0.0)
                .animation(.spring(response: 0.4, dampingFraction: 0.6), value: showCheckmark)

            Text(message)
                .font(.subheadline.weight(.medium))
                .multilineTextAlignment(.center)

            Button {
                // Haptic feedback on tap.
                let generator = UIImpactFeedbackGenerator(style: .light)
                generator.impactOccurred()
                done(true)
            } label: {
                Text("완료")
                    .font(.headline)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 12)
            }
            .buttonStyle(.borderedProminent)
            .tint(brandOrange)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 12)
        .onAppear {
            withAnimation { showCheckmark = true }
            let generator = UINotificationFeedbackGenerator()
            generator.notificationOccurred(.success)
        }
    }

    // MARK: Error

    /// Error state with a clear message and retry button.
    ///
    /// Design decisions:
    /// - Red circle icon is universally understood.
    /// - Retry button uses bordered (not prominent) style to reduce visual weight.
    /// - Haptic warning feedback on error to complement the visual.
    private func errorView(message: String) -> some View {
        VStack(spacing: 14) {
            Image(systemName: "exclamationmark.circle.fill")
                .font(.system(size: 44))
                .foregroundStyle(.red.opacity(0.85))

            Text(message)
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)

            // Show retry only when retrying is meaningful.
            if canRetry {
                Button {
                    let generator = UIImpactFeedbackGenerator(style: .light)
                    generator.impactOccurred()
                    Task { await perform() }
                } label: {
                    Label("다시 시도", systemImage: "arrow.clockwise")
                        .font(.subheadline.weight(.medium))
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 10)
                }
                .buttonStyle(.bordered)
                .tint(brandOrange)
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 12)
        .onAppear {
            // Haptic warning on error.
            let generator = UINotificationFeedbackGenerator()
            generator.notificationOccurred(.warning)
        }
    }

    /// Retry is meaningful when we have input and either we're connecting or we have a token.
    private var canRetry: Bool {
        guard input != nil else { return false }
        return isConnecting || token != nil
    }

    // MARK: - Network Logic

    /// Performs the save or pairing action.
    ///
    /// This method handles three flows:
    /// 1. **No input** — immediate error, nothing to save.
    /// 2. **NUFF-CONNECT:** — pairing handshake to link the extension to an account.
    /// 3. **Regular URL** — POST to captures/shortcut to save the link.
    @MainActor
    private func perform() async {
        // Reset animation state for retries.
        showCheckmark = false

        guard let input else {
            phase = .error(message: "공유할 링크를 찾지 못했어요.")
            return
        }

        phase = .loading

        do {
            if isConnecting {
                try await performPairing(input: input)
            } else {
                try await performSave(url: input)
            }
        } catch {
            // Only update phase to error if we haven't already set a specific error.
            if case .error = phase { /* already set */ } else {
                phase = .error(message: "연결하지 못했어요. 인터넷 연결을 확인하고 다시 시도해주세요.")
            }
        }
    }

    // MARK: Pairing Flow

    @MainActor
    private func performPairing(input: String) async throws {
        let code = String(input.dropFirst("NUFF-CONNECT:".count))

        // Validate the 8-character code from the allowed alphabet.
        let allowedChars = CharacterSet(charactersIn: "ABCDEFGHJKLMNPQRSTUVWXYZ23456789")
        guard code.count == 8,
              code.unicodeScalars.allSatisfy({ allowedChars.contains($0) }) else {
            phase = .error(message: "연결 코드가 올바르지 않아요.\nNuff 앱에서 '공유 준비하기'를 다시 눌러주세요.")
            return
        }

        var request = URLRequest(url: apiBase.appending(path: "auth/pair"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(["code": code])

        let (data, response) = try await URLSession.shared.data(for: request)
        let result = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]

        guard (response as? HTTPURLResponse)?.statusCode == 200,
              let newToken = result?["token"] as? String else {
            phase = .error(
                message: result?["message"] as? String
                    ?? "연결 시간이 지났어요.\nNuff 앱에서 '공유 준비하기'를 다시 눌러주세요."
            )
            return
        }

        UserDefaults.standard.set(newToken, forKey: "nuffDeviceToken")
        token = newToken
        phase = .pairingSuccess(message: "공유 준비 완료!\n이제 마음에 드는 링크에서\n공유 → Nuff를 눌러보세요.")
    }

    // MARK: Save Flow

    @MainActor
    private func performSave(url: String) async throws {
        guard let token else {
            phase = .error(message: "먼저 Nuff 앱에 로그인하고\n'공유 준비하기'를 한 번 눌러주세요.")
            return
        }

        var request = URLRequest(url: apiBase.appending(path: "captures/shortcut"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.httpBody = try JSONEncoder().encode(["url": url])

        let (data, response) = try await URLSession.shared.data(for: request)
        let result = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
        let statusCode = (response as? HTTPURLResponse)?.statusCode

        // Handle 401 — token expired or revoked.
        if statusCode == 401 {
            UserDefaults.standard.removeObject(forKey: "nuffDeviceToken")
            self.token = nil
            phase = .error(message: "Nuff 앱에서 공유 계정을 다시 연결해주세요.")
            return
        }

        guard statusCode == 200 else {
            phase = .error(
                message: result?["message"] as? String
                    ?? "지금은 저장하지 못했어요.\n다시 시도해주세요."
            )
            return
        }

        // Extract today's save count from server response if available.
        let todayCount = result?["todayCount"] as? Int

        let message = result?["message"] as? String ?? "저장했어요!"
        phase = .success(message: message, todayCount: todayCount)
    }
}

// MARK: - SharePhase Helpers

extension SharePhase {
    var isSuccess: Bool {
        switch self {
        case .success, .pairingSuccess: return true
        default: return false
        }
    }
}
