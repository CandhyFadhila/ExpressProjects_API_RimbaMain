const { toDatabaseUTC } = require("./dateHelper");

function _pickFirstNonEmpty(v) {
  // Case: array asli dari parser (?start_date[]=...&start_date[]=...)
  if (Array.isArray(v)) {
    for (const x of v) {
      const s = x == null ? "" : String(x).trim();
      if (s) return s;
    }
    return null;
  }

  // Case: string
  if (typeof v === "string") {
    let s = v.trim();
    if (!s) return null;

    // Toleransi: user mengirim "[...]" sebagai string (bukan array sesungguhnya)
    if (s.startsWith("[") && s.endsWith("]")) {
      // buang bracket
      s = s.slice(1, -1).trim();
      if (!s) return null;

      // jika ada koma, ambil elemen pertama
      // dukung optional quote di sekitar elemen
      const first = s
        .split(",")[0]
        ?.trim()
        .replace(/^['"]|['"]$/g, "");
      return first || null;
    }

    // string biasa
    return s;
  }

  // Fallback tipe lain
  const s = v == null ? "" : String(v).trim();
  return s || null;
}

function validateDateRangeRequiredBoth(startInput, endInput) {
  const startRaw = _pickFirstNonEmpty(startInput);
  const endRaw = _pickFirstNonEmpty(endInput);

  // Hanya satu yang dikirim → error
  const onlyOne = (startRaw && !endRaw) || (!startRaw && endRaw);
  if (onlyOne) {
    return {
      ok: false,
      code: "DATE_RANGE_PARTIAL",
      title: "Rentang Tanggal Tidak Lengkap",
      desc: "start_date dan end_date harus dikirim bersamaan.",
    };
  }

  // Keduanya tidak ada → tidak filter
  if (!startRaw && !endRaw) {
    return { ok: true, startDb: null, endDb: null, hasRange: false };
  }

  // Keduanya ada → parse & validasi
  const startDb = toDatabaseUTC(startRaw);
  const endDb = toDatabaseUTC(endRaw);

  if (!startDb) {
    return {
      ok: false,
      code: "INVALID_DATE_FORMAT",
      title: "Format Tanggal Salah",
      desc: "start_date tidak valid. Gunakan ISO 8601, mis. 2025-09-28T05:29:12.712Z.",
    };
  }
  if (!endDb) {
    return {
      ok: false,
      code: "INVALID_DATE_FORMAT",
      title: "Format Tanggal Salah",
      desc: "end_date tidak valid. Gunakan ISO 8601, mis. 2025-09-28T05:29:12.712Z.",
    };
  }

  // start harus <= end (string compare aman karena sama2 'YYYY-MM-DD HH:mm:ss')
  if (startDb > endDb) {
    return {
      ok: false,
      code: "INVALID_DATE_RANGE",
      title: "Rentang Tanggal Tidak Logis",
      desc: "start_date tidak boleh lebih besar dari end_date.",
    };
  }

  return { ok: true, startDb, endDb, hasRange: true };
}

// Ini buat filter rentang tanggal
function applyStartEndDateFilter(
  queryBuilder,
  column,
  startInput,
  endInput,
  opts = {}
) {
  const { inclusiveEnd = true } = opts;
  const v = validateDateRangeRequiredBoth(startInput, endInput);

  // Jika hanya salah satu → biarkan caller yang mengirim response 400 (v.ok === false)
  if (!v.ok) return queryBuilder;

  if (v.hasRange) {
    queryBuilder.andWhere(column, ">=", v.startDb);
    queryBuilder.andWhere(column, inclusiveEnd ? "<=" : "<", v.endDb);
  }
  return queryBuilder;
}

// Ini buat filter relasi dan filter ke tabel itu sendiri
function applyRelationIn(queryBuilder, column, values, opts = {}) {
  const { as = "number", negate = false, allowEmpty = false } = opts;

  // Normalisasi 'values' → array mentah
  //    - Dukung: categoryId[]=1&categoryId[]=2 → ['1','2']
  //    - Dukung: categoryId=[1,2]              → "[1,2]" (string)
  //    - Dukung: categoryId=1,2,3              → "1,2,3" (string)
  let arr;
  if (Array.isArray(values)) {
    arr = values;
  } else if (typeof values === "string") {
    let s = values.trim();
    if (!s) {
      arr = [];
    } else if (s.startsWith("[") && s.endsWith("]")) {
      try {
        const parsed = JSON.parse(s);
        arr = Array.isArray(parsed) ? parsed : [parsed];
      } catch {
        arr = s
          .slice(1, -1)
          .split(",")
          .map((v) => v.trim().replace(/^['"]|['"]$/g, ""))
          .filter(Boolean);
      }
    } else {
      arr = s
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean);
    }
  } else if (values == null) {
    arr = [];
  } else {
    arr = [values];
  }

  // 2) Koersi tipe + bersihkan
  let ids =
    as === "number"
      ? arr
          .map((v) => Number(String(v).trim()))
          .filter((v) => Number.isFinite(v))
      : arr.map((v) => String(v).trim()).filter((v) => v.length > 0);

  // 3) Unik-kan
  ids = [...new Set(ids)];

  // 4) Terapkan filter
  if (ids.length === 0) {
    if (allowEmpty) {
      queryBuilder.whereRaw("1=0");
    }
    return queryBuilder;
  }

  return negate
    ? queryBuilder.whereNotIn(column, ids)
    : queryBuilder.whereIn(column, ids);
}

// Ini buat pencarian
function applySearch(queryBuilder, search, columns) {
  if (!search || columns.length === 0) return queryBuilder;

  queryBuilder.where(function () {
    columns.forEach((column) => {
      this.orWhere(column, "ilike", `%${search}%`);
    });
  });

  return queryBuilder;
}

function escapeLike(val) {
  return String(val).replace(/[\\%_]/g, "\\$&");
}

// Ini buat pencarian jsonb (filter di dalam json "in" dan "eng")
function applyJsonbSearch(queryBuilder, search, exprs, opts = {}) {
  const { mode = "or", split = false } = opts;
  if (!search || !Array.isArray(exprs) || exprs.length === 0)
    return queryBuilder;

  const terms = split
    ? String(search).trim().split(/\s+/).filter(Boolean)
    : [String(search).trim()];

  if (terms.length === 0) return queryBuilder;

  queryBuilder.andWhere(function () {
    terms.forEach((t, ti) => {
      const like = `%${escapeLike(t)}%`;
      const cond = (ctx) => {
        exprs.forEach((e, ei) => {
          const sql = `(${e}) ILIKE ? ESCAPE '\\'`;
          if (ei === 0) ctx.whereRaw(sql, [like]);
          else ctx.orWhereRaw(sql, [like]);
        });
      };
      if (ti === 0) {
        this.where(function () {
          cond(this);
        });
      } else {
        if (mode === "and")
          this.andWhere(function () {
            cond(this);
          });
        else
          this.orWhere(function () {
            cond(this);
          });
      }
    });
  });

  return queryBuilder;
}

// Ini buat pagination
function applyPagination(params = {}) {
  // deteksi apakah key 'limit' benar-benar dikirim
  const hasLimitKey = Object.prototype.hasOwnProperty.call(params, "limit");
  const rawLimit = hasLimitKey ? params.limit : undefined;
  const rawPage = params.page;

  const isUnlimited =
    !hasLimitKey ||
    rawLimit === undefined ||
    rawLimit === "" ||
    String(rawLimit).toLowerCase() === "Infinity" ||
    String(rawLimit).toLowerCase() === "*" ||
    Number(rawLimit) === 0 ||
    Number(rawLimit) === -1;

  if (isUnlimited) {
    return { page: 1, limit: null, offset: 0, unlimited: true };
  }

  const p = Math.max(parseInt(rawPage, 10) || 1, 1);
  const l = Math.max(parseInt(rawLimit, 10) || 10, 1);
  return { page: p, limit: l, offset: (p - 1) * l, unlimited: false };
}

async function formatPaginationResult(
  baseQueryBuilder,
  paginationInfo,
  knexInstance
) {
  const { page, limit, offset, unlimited } = paginationInfo;

  // DATA
  const dataQuery = baseQueryBuilder.clone();
  if (!unlimited) {
    dataQuery.limit(limit).offset(offset);
  }
  const data = await dataQuery;

  // TOTAL
  const countWrapped = baseQueryBuilder.clone().clearSelect().clearOrder();
  const [{ count }] = await knexInstance
    .count("*")
    .from(countWrapped.as("subquery"));
  const total = parseInt(count, 10) || 0;

  // PAGINATION META/LINKS
  if (unlimited) {
    return {
      data,
      pagination: {
        meta: {
          current_page: 1,
          last_page: 1,
          per_page: null,
          total,
        },
        links: {
          first: null,
          last: null,
          prev: null,
          next: null,
        },
      },
    };
  }

  const lastPage = total === 0 ? 1 : Math.ceil(total / limit);

  return {
    data,
    pagination: {
      meta: {
        current_page: page,
        last_page: lastPage,
        per_page: limit,
        total,
      },
      links: {
        first: `?page=1&limit=${limit}`,
        last: `?page=${lastPage}&limit=${limit}`,
        prev: page > 1 ? `?page=${page - 1}&limit=${limit}` : null,
        next: page < lastPage ? `?page=${page + 1}&limit=${limit}` : null,
      },
    },
  };
}

module.exports = {
  validateDateRangeRequiredBoth,
  applyStartEndDateFilter,
  applyRelationIn,
  applySearch,
  applyJsonbSearch,
  applyPagination,
  formatPaginationResult,
};
