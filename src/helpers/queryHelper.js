const { normIdArray } = require("./inputNorm");
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

function applyRelationIn(queryBuilder, column, values, opts = {}) {
  const { as = "number" } = opts;
  const ids = normIdArray(values, { as }).filter((v) =>
    as === "number" ? Number.isFinite(v) : String(v).length > 0
  );
  if (ids.length > 0) {
    queryBuilder.whereIn(column, ids);
  }
  return queryBuilder;
}

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

function applyPagination({ page = 1, limit = 10 }) {
  const p = Math.max(parseInt(page) || 1, 1);
  const l = Math.max(parseInt(limit) || 10, 1);
  return { page: p, limit: l, offset: (p - 1) * l };
}

async function formatPaginationResult(
  baseQueryBuilder,
  paginationInfo,
  knexInstance
) {
  const { page, limit, offset } = paginationInfo;

  // Ambil DATA dari baseQuery + limit/offset (di clone agar base tetap murni)
  const dataQuery = baseQueryBuilder.clone().limit(limit).offset(offset);
  const data = await dataQuery;

  // Hitung TOTAL dari baseQuery TANPA limit/offset
  const countWrapped = baseQueryBuilder.clone().clearSelect().clearOrder();
  const [{ count }] = await knexInstance
    .count("*")
    .from(countWrapped.as("subquery"));

  const total = parseInt(count, 10) || 0;
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
