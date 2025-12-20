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
 * - string PG array "{1,2,3}" / '{"1","2"}' → di-parse
 * - string biasa "a,b,c" → split-by-comma + trim
 * - tipe lain → []
 */
function toArray(v) {
  if (Array.isArray(v)) return v;
  if (v == null) return [];

  if (typeof v === "string") {
    const s = v.trim();
    const j = parseJsonSafe(s);
    if (Array.isArray(j)) return j;

    const isPgArray = s.startsWith("{") && s.endsWith("}");
    const body = isPgArray ? s.slice(1, -1).trim() : s;
    if (!body) return [];

    return body
      .split(",")
      .map((x) => x.trim())
      .map((x) => {
        if (x.length >= 2 && x.startsWith('"') && x.endsWith('"')) {
          return x.slice(1, -1);
        }
        return x;
      })
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
      return String(v).trim();
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

/**
 * handleLocalizedText:
 * - Menerima object {id, en} atau string JSON serupa.
 * - Trimming, validasi tipe string, panjang (opsional), dan dukung partial (untuk update).
 * - Return { value: { id?, en? } } (object JS siap disimpan ke kolom JSONB).
 */
function handleLocalizedText(raw, opts = {}) {
  const {
    allowPartial = false, // true untuk update (boleh hanya id atau en saja)
    maxLen = undefined, // default batas name; set undefined/null untuk no-limit (mis. description)
    fieldLabel = "teks", // label untuk pesan error
  } = opts;

  let obj = raw;
  if (typeof obj === "string") {
    const parsed = parseJsonSafe(obj);
    obj = parsed ?? obj; // kalau bukan JSON valid, biarkan string untuk fail di bawah
  }

  if (!isPlainObject(obj)) {
    return {
      error: {
        code: "INVALID_CONTENT_FORMAT",
        message: `Format ${fieldLabel} harus berupa objek { id, en }.`,
      },
    };
  }

  const out = {};
  const hasId = Object.prototype.hasOwnProperty.call(obj, "id");
  const hasEn = Object.prototype.hasOwnProperty.call(obj, "en");

  if (hasId) {
    if (typeof obj.id !== "string") {
      return {
        error: {
          code: "INVALID_CONTENT_FORMAT",
          message: `${fieldLabel}.id harus string.`,
        },
      };
    }
    out.id = obj.id.trim();
    if (!allowPartial && out.id === "") {
      return {
        error: {
          code: "INVALID_CONTENT_FORMAT",
          message: `${fieldLabel}.id tidak boleh kosong.`,
        },
      };
    }
    if (typeof maxLen === "number" && out.id && out.id.length > maxLen) {
      return {
        error: {
          code: "INVALID_CONTENT_FORMAT",
          message: `${fieldLabel}.id maksimal ${maxLen} karakter.`,
        },
      };
    }
  }

  if (hasEn) {
    if (typeof obj.en !== "string") {
      return {
        error: {
          code: "INVALID_CONTENT_FORMAT",
          message: `${fieldLabel}.en harus string.`,
        },
      };
    }
    out.en = obj.en.trim();
    if (!allowPartial && out.en === "") {
      return {
        error: {
          code: "INVALID_CONTENT_FORMAT",
          message: `${fieldLabel}.en tidak boleh kosong.`,
        },
      };
    }
    if (typeof maxLen === "number" && out.en && out.en.length > maxLen) {
      return {
        error: {
          code: "INVALID_CONTENT_FORMAT",
          message: `${fieldLabel}.en maksimal ${maxLen} karakter.`,
        },
      };
    }
  }

  if (!allowPartial && (!hasId || !hasEn)) {
    return {
      error: {
        code: "INVALID_CONTENT_FORMAT",
        message: `${fieldLabel} harus memiliki properti id dan en.`,
      },
    };
  }

  return { value: out };
}

module.exports = {
  toArray,
  normJsonbArray,
  normIdArray,
  normUUIDv4Array,
  parseJsonSafe,
  isPlainObject,
  handleLocalizedText,
};
