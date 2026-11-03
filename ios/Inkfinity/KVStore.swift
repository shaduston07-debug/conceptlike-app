import Foundation

/// File-backed key/value store used by the web layer for drawings, settings and the library.
final class KVStore {
    let dir: URL

    init() {
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        dir = base.appendingPathComponent("Draftwell/kv", isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        var values = URLResourceValues()
        values.isExcludedFromBackup = false
        var d = dir
        try? d.setResourceValues(values)
    }

    private func encode(_ key: String) -> String {
        Data(key.utf8).base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
    }

    private func decode(_ name: String) -> String? {
        var s = name.replacingOccurrences(of: "-", with: "+").replacingOccurrences(of: "_", with: "/")
        while s.count % 4 != 0 { s += "=" }
        guard let d = Data(base64Encoded: s) else { return nil }
        return String(data: d, encoding: .utf8)
    }

    private func url(_ key: String) -> URL {
        dir.appendingPathComponent(encode(key) + ".kv")
    }

    func get(_ key: String) -> String? {
        guard let d = try? Data(contentsOf: url(key)) else { return nil }
        return String(data: d, encoding: .utf8)
    }

    func set(_ key: String, _ value: String) {
        try? Data(value.utf8).write(to: url(key), options: .atomic)
    }

    func delete(_ key: String) {
        try? FileManager.default.removeItem(at: url(key))
    }

    func keys(prefix: String) -> [String] {
        let names = (try? FileManager.default.contentsOfDirectory(atPath: dir.path)) ?? []
        var out: [String] = []
        for n in names where n.hasSuffix(".kv") {
            if let k = decode(String(n.dropLast(3))), k.hasPrefix(prefix) { out.append(k) }
        }
        return out
    }

    /// All localStorage-shim values (keys stored with the "ls:" prefix), without the prefix.
    func localStorageSnapshot() -> [String: String] {
        var out: [String: String] = [:]
        for k in keys(prefix: "ls:") {
            if let v = get(k) { out[String(k.dropFirst(3))] = v }
        }
        return out
    }
}
