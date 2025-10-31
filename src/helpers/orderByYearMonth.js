function orderByYearMonth(
  colYear = "year",
  colMonth = "month",
  dirYear = "asc",
  dirMonth = "asc"
) {
  const dY = String(dirYear).toUpperCase() === "DESC" ? "DESC" : "ASC";
  const dM = String(dirMonth).toUpperCase() === "DESC" ? "DESC" : "ASC";
  const sql = `?? ${dY}, ?? ${dM}, ?? ASC`;
  const bindings = [colYear, colMonth, "id"];
  return { sql, bindings };
}
module.exports = { orderByYearMonth };
