const knex = require("../config/database");

async function resolveArrayRelations(value, table, mapFn = (r) => r) {
  const ids = normalizeIds(value);
  if (ids.length === 0) return [];

  const rows = await knex(table).whereIn("id", ids).select("*");
  const map = new Map(rows.map((r) => [Number(r.id), r]));

  return ids
    .map((id) => {
      const row = map.get(Number(id));
      return row ? mapFn(row) : null;
    })
    .filter(Boolean);
}

function normalizeIds(value) {
  let arr = [];

  if (value == null) return arr;
  if (Array.isArray(value)) {
    arr = value;
  } else if (typeof value === "string") {
    try {
      arr = JSON.parse(value);
    } catch {
      arr = [];
    }
  } else if (typeof value === "object") {
    arr = value;
  }

  // dukung bentuk [2], ["2"], [{id:2}], [{id:"2"}]
  arr = arr
    .map((v) => {
      if (v && typeof v === "object") v = v.id ?? v.value ?? v.ID ?? null;
      if (typeof v === "bigint") v = Number(v);
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    })
    .filter((v) => v != null);

  return arr;
}

module.exports = { resolveArrayRelations };
