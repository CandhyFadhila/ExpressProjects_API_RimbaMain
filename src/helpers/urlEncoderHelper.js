// Encode URL dengan aman: spasi → %20, karakter khusus di path ter-encode,
// tanpa merusak query string atau hash, dan tanpa double-encode.

function encodePathSegments(pathname) {
  return String(pathname)
    .split("/")
    .map((seg) => {
      if (seg === "") return seg; // biarkan leading/trailing slash
      try {
        seg = decodeURIComponent(seg);
      } catch {}
      return encodeURIComponent(seg);
    })
    .join("/");
}

/**
 * Encode URL (absolute atau relative).
 * Contoh:
 *  - "http://host/files/nama file.pdf" → "http://host/files/nama%20file.pdf"
 *  - "/uploads/folder saya/file (1).pdf" → "/uploads/folder%20saya/file%20(1).pdf"
 */
function encodeUrl(url) {
  if (url == null) return url;
  const s = String(url);

  // Absolute URL
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(s)) {
    try {
      const u = new URL(s);
      u.pathname = encodePathSegments(u.pathname);
      // Query & hash dibiarkan; URL class akan handle encoding sesuai standar
      return u.toString();
    } catch {
      // fallback minimal: spasi → %20
      return s.replace(/ /g, "%20");
    }
  }

  // Relative URL
  const [pathAndQuery, hash = ""] = s.split("#", 2);
  const [pathOnly, query = ""] = pathAndQuery.split("?", 2);
  const encodedPath = encodePathSegments(pathOnly);
  return encodedPath + (query ? `?${query}` : "") + (hash ? `#${hash}` : "");
}

/**
 * Utility untuk menormalkan field URL di payload response dari storage.
 * Bisa dipakai untuk array objek atau objek tunggal.
 */
function encodeFileUrlPayload(payload, field = "server_file_url") {
  if (Array.isArray(payload)) {
    return payload.map((row) =>
      row && typeof row === "object"
        ? { ...row, [field]: encodeUrl(row[field]) }
        : row
    );
  }
  if (payload && typeof payload === "object") {
    return { ...payload, [field]: encodeUrl(payload[field]) };
  }
  return payload;
}

module.exports = { encodeUrl, encodePathSegments, encodeFileUrlPayload };
