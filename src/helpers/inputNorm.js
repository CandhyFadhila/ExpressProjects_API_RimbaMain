/**
 * Cek object biasa (bukan Array/Date/Function/etc.)
 */
const isPlainObject = (v) =>
  Object.prototype.toString.call(v) === "[object Object]";

/**
 * JSON.parse aman (tidak melempar)
 */
const parseJsonSafe = (s) => {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
};

/**
 * toArray:
 * - Menerima array → dikembalikan apa adanya
 * - null/undefined → []
 * - string JSON array → di-parse
 * - string biasa "a,b,c" → split-by-comma + trim
 * - tipe lain → []
 */
function toArray(v) {
  if (Array.isArray(v)) return v;
  if (v == null) return [];
  if (typeof v === "string") {
    const j = parseJsonSafe(v);
    if (Array.isArray(j)) return j;
    return v
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

/**
 * normJsonbArray:
 * - Untuk kolom JSONB dari PostgreSQL yang kadang sudah menjadi array,
 *   kadang masih string JSON.
 * - Hanya mengembalikan array; kalau bukan array → []
 */
function normJsonbArray(v) {
  if (Array.isArray(v)) return v;
  if (v == null) return [];
  if (typeof v === "string") {
    const j = parseJsonSafe(v);
    return Array.isArray(j) ? j : [];
  }
  // Jika driver sudah parse JSONB ke objek/array JS:
  if (isPlainObject(v)) return Array.isArray(v) ? v : [];
  return [];
}

/**
 * normIdArray:
 * - Menormalkan beragam bentuk ID menjadi array konsisten (number/string).
 * - Menerima bentuk: [2], ["2"], [{id:2}], [{id:"2"}]
 *   (key objek bisa diatur, default "id")
 * - Opsi:
 *   - as: "number" | "string" | "bigint"
 *   - key: nama properti pada objek (default "id")
 */
function normIdArray(value, opts = {}) {
  const { as = "number", key = "id" } = opts;

  // Ambil sumber array:
  let arr;
  if (Array.isArray(value)) arr = value;
  else if (typeof value === "string") {
    const j = parseJsonSafe(value);
    arr = Array.isArray(j) ? j : toArray(value); // "1,2,3" → ["1","2","3"]
  } else if (value && typeof value === "object") {
    arr = normJsonbArray(value);
  } else {
    arr = [];
  }

  // Map ke tipe yang diminta
  const mapped = arr
    .map((v) => {
      if (v != null && typeof v === "object") v = v[key];
      if (v == null) return null;

      if (as === "number") {
        const n = Number(v);
        return Number.isFinite(n) ? n : null;
      }
      if (as === "bigint") {
        try {
          // biarkan caller yang memastikan aman untuk > 2^53-1
          return BigInt(String(v));
        } catch {
          return null;
        }
      }
      // default string
      return String(v);
    })
    .filter((v) => v != null);

  return mapped;
}

/**
 * normUUIDv4Array:
 * - Menormalkan list UUID v4 (mis. document_ids/file_ids) dari berbagai bentuk input.
 * - Mendukung [{id: "<uuid>"}], ["<uuid>"], "<uuid>,<uuid>", "['<uuid>','<uuid>']"
 */
function normUUIDv4Array(value, key = "id") {
  const uuidV4 =
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  // Ambil sumber array tanpa gagal
  let raw = [];
  if (Array.isArray(value)) raw = value;
  else if (typeof value === "string") {
    const j = parseJsonSafe(value);
    raw = Array.isArray(j) ? j : toArray(value);
  } else if (value && typeof value === "object") {
    raw = normJsonbArray(value);
  }

  return raw
    .map((v) => {
      if (v != null && typeof v === "object") v = v[key];
      return v == null ? null : String(v).trim();
    })
    .filter((s) => typeof s === "string" && uuidV4.test(s));
}

module.exports = {
  toArray,
  normJsonbArray,
  normIdArray,
  normUUIDv4Array,
  parseJsonSafe,
  isPlainObject,
};
