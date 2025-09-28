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

function applyPagination(queryBuilder, { page = 1, limit = 10 }) {
  const offset = (page - 1) * limit;
  queryBuilder.limit(limit).offset(offset);
  return { page: parseInt(page), limit: parseInt(limit) };
}

async function formatPaginationResult(
  queryBuilder,
  paginationInfo,
  knexInstance
) {
  const data = await queryBuilder;
  const [{ count }] = await knexInstance
    .count("*")
    .from(queryBuilder.clone().clearSelect().clearOrder().as("subquery"));

  const total = parseInt(count);
  const lastPage = Math.ceil(total / paginationInfo.limit);

  return {
    data,
    pagination: {
      meta: {
        current_page: paginationInfo.page,
        last_page: lastPage,
        per_page: paginationInfo.limit,
        total,
      },
      links: {
        first: `?page=1&limit=${paginationInfo.limit}`,
        last: `?page=${lastPage}&limit=${paginationInfo.limit}`,
        prev:
          paginationInfo.page > 1
            ? `?page=${paginationInfo.page - 1}&limit=${paginationInfo.limit}`
            : null,
        next:
          paginationInfo.page < lastPage
            ? `?page=${paginationInfo.page + 1}&limit=${paginationInfo.limit}`
            : null,
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
