const MONTHS_ID = [
  "januari",
  "februari",
  "maret",
  "april",
  "mei",
  "juni",
  "juli",
  "agustus",
  "september",
  "oktober",
  "november",
  "desember",
];
const MONTHS_EN = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
];

function orderByMonthName(col = "month", dir = "asc") {
  const idList = MONTHS_ID.map((m) => `'${m}'`).join(",");
  const enList = MONTHS_EN.map((m) => `'${m}'`).join(",");
  const direction = String(dir).toUpperCase() === "DESC" ? "DESC" : "ASC";

  const sql = `
    COALESCE(
      array_position(ARRAY[${idList}], lower(??)),
      array_position(ARRAY[${enList}], lower(??)),
      999
    ) ${direction}, ?? ASC
  `;
  const bindings = [col, col, "id"];
  return { sql, bindings };
}

module.exports = { orderByMonthName };
