import SwiftUI
import UIKit

private let apiBase = URL(string: "https://nuff-kakao-ingress.cksrowldms9-475.workers.dev")!

@main
struct NuffApp: App {
    var body: some Scene { WindowGroup { ContentView() } }
}

struct ContentView: View {
    @AppStorage("nuffAccountToken") private var token = ""
    @AppStorage("nuffIntroSeen") private var introSeen = false
    var body: some View {
        if token.isEmpty && !introSeen {
            VStack(spacing: 24) {
                Image("AppIconPreview").resizable().frame(width: 88, height: 88).clipShape(RoundedRectangle(cornerRadius: 21))
                Text("마음에 드는 정보,\nNuff에 휙.").font(.largeTitle.bold()).multilineTextAlignment(.center)
                Text("영상이나 글을 보다가 공유 버튼으로 보내세요.\n나만의 보관함에서 다시 꺼내볼 수 있어요.").multilineTextAlignment(.center).foregroundStyle(.secondary)
                Button("시작하기") { introSeen = true }.buttonStyle(.borderedProminent).tint(.orange)
            }.padding(32)
        }
        else if token.isEmpty { AccountView(token: $token) }
        else { LibraryWelcomeView(token: $token) }
    }
}

private struct AccountView: View {
    @Binding var token: String
    @State private var email = ""
    @State private var password = ""
    @State private var isLogin = false
    @State private var isBusy = false
    @State private var error = ""

    var body: some View {
        ScrollView {
            VStack(spacing: 22) {
                Image("AppIconPreview").resizable().scaledToFit().frame(width: 88, height: 88)
                    .clipShape(RoundedRectangle(cornerRadius: 21))
                Text("Nuff").font(.largeTitle.bold())
                Text("발견한 정보를 가볍게 던져두세요.\nNuff가 한곳에 모아둘게요.")
                    .multilineTextAlignment(.center).foregroundStyle(.secondary)
                VStack(alignment: .leading, spacing: 9) {
                    Text("이메일").font(.caption).foregroundStyle(.secondary)
                    TextField("you@example.com", text: $email)
                        .textInputAutocapitalization(.never).keyboardType(.emailAddress)
                        .textContentType(.emailAddress).padding(13)
                        .background(Color(uiColor: .secondarySystemBackground), in: RoundedRectangle(cornerRadius: 10))
                    Text("비밀번호").font(.caption).foregroundStyle(.secondary).padding(.top, 5)
                    SecureField("10자 이상", text: $password)
                        .textContentType(isLogin ? .password : .newPassword).padding(13)
                        .background(Color(uiColor: .secondarySystemBackground), in: RoundedRectangle(cornerRadius: 10))
                }
                Button { Task { await authenticate() } } label: {
                    HStack {
                        if isBusy { ProgressView().tint(.white) }
                        Text(isLogin ? "로그인" : "Nuff 계정 만들기")
                    }.frame(maxWidth: .infinity).padding(.vertical, 12)
                }
                .buttonStyle(.borderedProminent).tint(.orange)
                .disabled(isBusy || !email.contains("@") || password.count < 10)
                if !error.isEmpty { Text(error).font(.callout).foregroundStyle(.red).multilineTextAlignment(.center) }
                Button(isLogin ? "처음이에요 · 계정 만들기" : "이미 계정이 있어요 · 로그인") {
                    isLogin.toggle(); error = ""
                }.font(.callout)
            }.padding(32)
        }
    }

    @MainActor
    private func authenticate() async {
        isBusy = true; error = ""
        do {
            var request = URLRequest(url: apiBase.appending(path: isLogin ? "auth/login" : "auth/signup"))
            request.httpMethod = "POST"
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONEncoder().encode(["email": email, "password": password])
            let (data, response) = try await URLSession.shared.data(for: request)
            let json = try JSONSerialization.jsonObject(with: data) as? [String: Any]
            guard (response as? HTTPURLResponse)?.statusCode == 200,
                  let newToken = json?["token"] as? String else {
                throw LoginError.message(json?["message"] as? String ?? "계정을 확인하지 못했어요.")
            }
            token = newToken
        } catch let LoginError.message(message) { error = message }
        catch { self.error = "네트워크 연결을 확인해주세요." }
        isBusy = false
    }
}

private struct SavedLink: Decodable, Identifiable {
    let id: String
    let title: String
    let url: String
    let summary: String
}

private struct LibraryResponse: Decodable { let items: [SavedLink] }

private struct LibraryWelcomeView: View {
    @Binding var token: String
    @Environment(\.scenePhase) private var scenePhase
    @AppStorage("nuffSharePreparedAccount") private var preparedAccount = ""
    @State private var accountID = ""
    @State private var email = ""
    @State private var kakaoConnected = false
    @State private var items: [SavedLink] = []
    @State private var loaded = false
    @State private var loading = false
    @State private var preparing = false
    @State private var handoff = ""
    @State private var showShare = false
    @State private var showGuide = false
    @State private var showSettings = false
    @State private var error = ""

    private var prepared: Bool { !accountID.isEmpty && preparedAccount == accountID }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 22) {
                    Text(loaded ? "저장한 콘텐츠 \(items.count)개" : "보관함을 확인하고 있어요.")
                        .foregroundStyle(.secondary)
                    if !prepared || items.isEmpty || showGuide {
                        VStack(alignment: .leading, spacing: 15) {
                            Text(prepared ? "첫 링크를 보내볼까요?" : "공유로 가볍게 저장하세요").font(.title2.bold())
                            Text("1. Safari나 YouTube에서 마음에 드는 링크 찾기\n2. 공유 버튼 누르기\n3. Nuff 선택하기").lineSpacing(6)
                            Text("Nuff가 안 보이면 공유 목록의 ‘더 보기’에서 찾아주세요. 편집에서 즐겨찾기에 추가하면 더 편해요.")
                                .font(.callout).foregroundStyle(.secondary)
                            if !prepared {
                                Button { Task { await prepareShare() } } label: {
                                    HStack {
                                        if preparing { ProgressView().tint(.white) }
                                        Text("공유 준비하기")
                                    }.frame(maxWidth: .infinity)
                                }.buttonStyle(.borderedProminent).tint(.orange)
                                    .disabled(preparing || accountID.isEmpty)
                                Text("열리는 공유창에서 Nuff를 선택하면 이 보관함과 연결돼요.").font(.caption).foregroundStyle(.secondary)
                            } else {
                                Label("공유 준비 완료", systemImage: "checkmark.circle.fill").foregroundStyle(.green)
                                Link("Safari에서 링크 찾아보기", destination: URL(string: "https://www.google.com")!)
                            }
                        }.padding(20).background(Color.orange.opacity(0.08), in: RoundedRectangle(cornerRadius: 18))
                    }
                    if !error.isEmpty {
                        Text(error).foregroundStyle(.red).font(.callout)
                        Button("다시 불러오기") { Task { await loadLibrary() } }
                    }
                    ForEach(items) { item in
                        if let url = URL(string: item.url) {
                            Link(destination: url) {
                                VStack(alignment: .leading, spacing: 8) {
                                    Text(item.title).font(.headline).foregroundStyle(.primary)
                                    Text(item.summary).font(.callout).foregroundStyle(.secondary).lineLimit(3)
                                    Label("원문 열기", systemImage: "arrow.up.right").font(.caption)
                                }.frame(maxWidth: .infinity, alignment: .leading).padding(18)
                                    .background(Color(uiColor: .secondarySystemBackground), in: RoundedRectangle(cornerRadius: 14))
                            }
                        }
                    }
                }.padding(24)
            }
            .navigationTitle("나의 Nuff")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button { showSettings = true } label: { Image(systemName: "gearshape") }.accessibilityLabel("설정")
                }
            }
            .refreshable { await loadLibrary() }
            .task { await loadLibrary() }
            .onChange(of: scenePhase) { _, phase in
                if phase == .active { Task { await loadLibrary() } }
            }
            .sheet(isPresented: $showShare, onDismiss: { Task { await loadLibrary() } }) {
                ShareSheet(items: [handoff]) { completed in
                    if completed { preparedAccount = accountID }
                    showShare = false
                }
            }
            .sheet(isPresented: $showSettings) {
                NavigationStack {
                    List {
                        Section("계정") {
                            Text(email.isEmpty ? "Nuff 계정" : email)
                            Button("로그아웃", role: .destructive) { token = "" }
                        }
                        Section("공유로 저장") {
                            Button("공유 사용법 다시 보기") { showGuide = true; showSettings = false }
                            Button("공유 계정 다시 연결") {
                                preparedAccount = ""; showGuide = true; showSettings = false
                            }
                        }
                        Section {
                            NavigationLink("카카오톡", destination: KakaoSettingsView(token: token, connected: kakaoConnected) {
                                await loadLibrary()
                            })
                            HStack { Text("DM · 디스코드"); Spacer(); Text("준비 중").foregroundStyle(.secondary) }
                        } header: { Text("수집 채널 추가 · 선택") }
                          footer: { Text("채널을 추가하면 그곳에 보낸 링크도 같은 보관함에 모여요. 지금 연결하지 않아도 Nuff를 사용할 수 있어요.") }
                    }.navigationTitle("설정")
                        .toolbar { ToolbarItem(placement: .confirmationAction) { Button("완료") { showSettings = false } } }
                }
            }
        }
    }

    @MainActor
    private func prepareShare() async {
        preparing = true; error = ""
        defer { preparing = false }
        do {
            var request = URLRequest(url: apiBase.appending(path: "auth/device-code"))
            request.httpMethod = "POST"
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
            let (data, response) = try await URLSession.shared.data(for: request)
            guard (response as? HTTPURLResponse)?.statusCode == 200,
                  let json = try JSONSerialization.jsonObject(with: data) as? [String: Any],
                  let code = json["code"] as? String else { throw LoginError.message("공유 연결을 준비하지 못했어요. 다시 시도해주세요.") }
            handoff = "NUFF-CONNECT:\(code)"
            showShare = true
        } catch { self.error = "공유 연결을 준비하지 못했어요. 잠시 후 다시 시도해주세요." }
    }

    @MainActor
    private func loadLibrary() async {
        guard !loading else { return }
        loading = true; error = ""
        defer { loading = false }
        do {
            var request = URLRequest(url: apiBase.appending(path: "captures"))
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
            let (data, response) = try await URLSession.shared.data(for: request)
            guard (response as? HTTPURLResponse)?.statusCode == 200 else { throw URLError(.badServerResponse) }
            let library = try JSONDecoder().decode(LibraryResponse.self, from: data)
            items = library.items; loaded = true
            request.url = apiBase.appending(path: "auth/me")
            let (profileData, profileResponse) = try await URLSession.shared.data(for: request)
            guard (profileResponse as? HTTPURLResponse)?.statusCode == 200,
                  let profile = try JSONSerialization.jsonObject(with: profileData) as? [String: Any],
                  let user = profile["user"] as? [String: Any],
                  let id = user["id"] as? String else { throw URLError(.badServerResponse) }
            accountID = id; email = user["email"] as? String ?? ""
            kakaoConnected = (profile["providers"] as? [String] ?? []).contains("kakao")
        } catch { self.error = "보관함을 불러오지 못했어요. 아래로 당기거나 다시 불러오기를 눌러주세요." }
    }
}

private struct KakaoSettingsView: View {
    let token: String
    let connected: Bool
    let refresh: () async -> Void
    @State private var linked = false
    @State private var code = ""
    @State private var busy = false
    @State private var error = ""
    var body: some View {
        Form {
            if connected || linked {
                Label("이 보관함에 연결되어 있어요", systemImage: "checkmark.circle.fill")
                Link("Nuff 채팅 열기", destination: URL(string: "https://pf.kakao.com/_xkxaxmaX/chat")!)
            } else {
                Section {
                    Text("Nuff 채팅에 ‘앱 연결’을 보내고 받은 코드를 입력하세요. 기존 카카오 자료도 이 보관함에 함께 모여요.")
                    Link("Nuff 채팅 열기", destination: URL(string: "https://pf.kakao.com/_xkxaxmaX/chat")!)
                    TextField("카카오에서 받은 8자리 코드", text: $code).textInputAutocapitalization(.characters).autocorrectionDisabled()
                    Button(busy ? "연결 중…" : "카카오톡 연결") { Task { await connect() } }.disabled(busy || code.count != 8)
                    if !error.isEmpty { Text(error).foregroundStyle(.red) }
                }
            }
        }.navigationTitle("카카오톡 연결")
    }
    @MainActor private func connect() async {
        busy = true; error = ""
        defer { busy = false }
        do {
            var request = URLRequest(url: apiBase.appending(path: "auth/link-kakao"))
            request.httpMethod = "POST"
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONEncoder().encode(["code": code.uppercased()])
            let (data, response) = try await URLSession.shared.data(for: request)
            let result = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
            guard (response as? HTTPURLResponse)?.statusCode == 200 else { throw LoginError.message(result?["message"] as? String ?? "연결하지 못했어요.") }
            // A same-account share code does not establish a Kakao identity.
            request.url = apiBase.appending(path: "auth/me"); request.httpMethod = "GET"; request.httpBody = nil
            let (profileData, _) = try await URLSession.shared.data(for: request)
            let profile = (try? JSONSerialization.jsonObject(with: profileData)) as? [String: Any]
            guard (profile?["providers"] as? [String] ?? []).contains("kakao") else { throw LoginError.message("카카오톡 Nuff 채팅에서 받은 코드를 입력해주세요.") }
            linked = true; await refresh()
        } catch let LoginError.message(message) { error = message }
          catch { self.error = "연결하지 못했어요. 잠시 후 다시 시도해주세요." }
    }
}

private enum LoginError: Error { case message(String) }

private struct ShareSheet: UIViewControllerRepresentable {
    let items: [Any]
    let completion: (Bool) -> Void
    func makeUIViewController(context: Context) -> UIActivityViewController {
        let controller = UIActivityViewController(activityItems: items, applicationActivities: nil)
        controller.completionWithItemsHandler = { activity, completed, _, _ in
            completion(completed && activity?.rawValue == "com.nuff.personal.share")
        }
        return controller
    }
    func updateUIViewController(_ controller: UIActivityViewController, context: Context) {}
}
