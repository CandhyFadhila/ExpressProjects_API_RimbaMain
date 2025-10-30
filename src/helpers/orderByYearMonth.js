function orderByYearMonth(
  colYear = "year",
  colMonthIdx = "month_index",
  dirYear = "asc",
  dirMonth = "asc"
) {
  const dY = String(dirYear).toUpperCase() === "DESC" ? "DESC" : "ASC";
  const dM = String(dirMonth).toUpperCase() === "DESC" ? "DESC" : "ASC";
  const sql = `?? ${dY}, ?? ${dM}, ?? ASC`;
  const bindings = [colYear, colMonthIdx, "id"];
  return { sql, bindings };
}
module.exports = { orderByYearMonth };
