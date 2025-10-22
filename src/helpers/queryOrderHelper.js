/**
 * Urutan:
 *  - deleted_at IS NULL di atas,
 *  - created_at DESC,
 *  - id DESC (tie-breaker agar insert terbaru selalu di atas).
 */
function applyLatestThenTrashed(
  query,
  deletedCol = "deleted_at",
  createdCol = "created_at",
  idCol = "id"
) {
  return query.orderByRaw(
    "CASE WHEN ?? IS NULL THEN 0 ELSE 1 END ASC, ?? DESC, ?? DESC",
    [deletedCol, createdCol, idCol]
  );
}

module.exports = { applyLatestThenTrashed };
