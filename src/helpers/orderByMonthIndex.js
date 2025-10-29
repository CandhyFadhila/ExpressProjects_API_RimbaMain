function orderByMonthIndex(col = "month_index", dir = "asc") {
  const direction = String(dir).toUpperCase() === "DESC" ? "DESC" : "ASC";
  const sql = `?? ${direction}, ?? ASC`; // fallback by id
  const bindings = [col, "id"];
  return { sql, bindings };
}

module.exports = { orderByMonthIndex };
