const { URL } = require("url");

/**
 * getAppEnv
 * Mengambil nilai environment aplikasi (mis. linux/windows) secara konsisten.
 */
function getAppEnv() {
  return String(process.env.PG_ENV || "windows")
    .trim()
    .toLowerCase();
}

/**
 * isLinux
 * Mengecek apakah environment saat ini adalah linux.
 */
function isLinux() {
  return getAppEnv() === "linux";
}

/**
 * toInt
 * Mengubah string env menjadi integer dengan fallback.
 */
function toInt(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * normalizeBaseUrl
 * Menormalkan base URL (valid URL, tanpa trailing slash).
 */
function normalizeBaseUrl(input) {
  const raw = String(input || "").trim();
  if (!raw) return null;
  const u = new URL(raw);
  return `${u.protocol}//${u.host}`;
}

/**
 * resolvePublicBaseUrl
 * Satu pintu resolver base URL berdasarkan service + env var, lalu fallback per environment.
 */
function resolvePublicBaseUrl(service, ports = {}) {
  const key = service === "docs" ? "DOC_SERVER_BASE_URL" : "PUBLIC_BASE_URL";

  const fromEnv = normalizeBaseUrl(process.env[key]);
  if (fromEnv) return fromEnv;

  const portApp = toInt(ports.app, 4000);
  const portDocs = toInt(ports.docs, 4001);

  if (isLinux()) {
    return service === "docs"
      ? "https://doc.rimbaexium.org"
      : "https://rimbaexium.org";
  }

  return service === "docs"
    ? `http://localhost:${portDocs}`
    : `http://localhost:${portApp}`;
}

module.exports = { getAppEnv, isLinux, resolvePublicBaseUrl };
