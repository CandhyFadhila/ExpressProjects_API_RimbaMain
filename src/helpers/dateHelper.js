const dayjs = require("dayjs");
const utc = require("dayjs/plugin/utc");
const timezone = require("dayjs/plugin/timezone");
const advancedFormat = require("dayjs/plugin/advancedFormat");
require("dayjs/locale/id");

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(advancedFormat);
dayjs.locale("id");

// Konvensi:
// - DB disimpan sebagai string UTC 'YYYY-MM-DD HH:mm:ss' (tanpa TZ) -> aman untuk TIMESTAMP WITHOUT TIME ZONE
// - Input tanpa offset diasumsikan WIB (Asia/Jakarta) agar konversi ke UTC benar
const DEFAULT_DB_TZ = "UTC";
const DEFAULT_INPUT_TZ = "Asia/Jakarta";
const DEFAULT_DISPLAY_TZ = "Asia/Jakarta";

// ISO 8601 dengan Z atau offset ±HH:mm (mis. 2025-09-04T06:39:15.333Z atau ...+07:00)
const ISO_Z_OR_OFFSET =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+\-]\d{2}:\d{2})$/i;

function isIso8601Z(v) {
  return ISO_Z_OR_OFFSET.test(String(v));
}

/**
 * Parse apapun -> dayjs UTC instance
 * - Jika string punya Z/offset: hormati offset tsb
 * - Jika string tanpa offset (e.g. '2025-09-04 13:30:00'): diasumsikan di DEFAULT_INPUT_TZ (WIB)
 */
function parseToUTC(datetime, inputTz = DEFAULT_INPUT_TZ) {
  if (datetime == null || datetime === "") return null;

  // epoch number (deteksi detik vs milidetik)
  if (typeof datetime === "number") {
    const ms = datetime < 1e12 ? datetime * 1000 : datetime;
    return dayjs.utc(ms);
  }

  if (datetime instanceof Date) return dayjs(datetime).utc();

  const s = String(datetime).trim();
  if (!s) return null;

  // ISO dengan Z/offset -> langsung ke UTC
  if (ISO_Z_OR_OFFSET.test(s)) return dayjs.utc(s);

  // Naive string -> anggap berada di inputTz (default WIB), lalu konversi ke UTC
  // Contoh format umum: 'YYYY-MM-DD HH:mm:ss' atau 'YYYY-MM-DD'
  const normalized = s.replace("T", " ");
  const guess = dayjs.tz(normalized, inputTz);
  return guess.isValid() ? guess.utc() : null;
}

/**
 * Normalisasi -> string UTC untuk penyimpanan ke DB (YYYY-MM-DD HH:mm:ss)
 */
function toDatabaseUTC(datetime, inputTz = DEFAULT_INPUT_TZ) {
  const d = parseToUTC(datetime, inputTz);
  return d ? d.tz(DEFAULT_DB_TZ).format("YYYY-MM-DD HH:mm:ss") : null;
}

/**
 * Format tanggal Indonesia (default tampilkan di WIB) sesuai tipe:
 * 1: 'Senin, 1 Januari 2025'
 * 2: 'Senin, 1 Januari 2025 pukul 15:30 WIB'
 * 3: '1 Januari 2025'
 * 4: '01-01-2025'
 * 5: '2025-01-01 15:30:00' (UTC eksplisit)
 * 6: '01/01/2025'
 */
function formatTanggalIndonesia(datetime, formatType = 1, opts = {}) {
  const inputTz = opts.inputTz || DEFAULT_INPUT_TZ;
  const displayTz = opts.displayTz || DEFAULT_DISPLAY_TZ;

  const dUTC = parseToUTC(datetime, inputTz);
  if (!dUTC) return "-";

  // Untuk tampilan Indonesia, default-nya konversi ke WIB
  const d = dUTC.tz(displayTz);

  switch (formatType) {
    case 1:
      return d.format("dddd, D MMMM YYYY");
    case 2:
      return `${d.format("dddd, D MMMM YYYY")} pukul ${d.format("HH:mm")} WIB`;
    case 3:
      return d.format("D MMMM YYYY");
    case 4:
      return d.format("DD-MM-YYYY");
    case 5:
      return dUTC.tz("UTC").format("YYYY-MM-DD HH:mm:ss"); // stempel UTC
    case 6:
      return d.format("DD/MM/YYYY");
    default:
      return d.format("D MMMM YYYY");
  }
}

/** Menghasilkan objek Date (UTC) jika perlu dipakai di tempat lain */
function toUTC(datetime, inputTz = DEFAULT_INPUT_TZ) {
  const d = parseToUTC(datetime, inputTz);
  return d ? d.toDate() : null;
}

module.exports = {
  isIso8601Z,
  toDatabaseUTC,
  formatTanggalIndonesia,
  toUTC,
  _internals: { parseToUTC },
};
