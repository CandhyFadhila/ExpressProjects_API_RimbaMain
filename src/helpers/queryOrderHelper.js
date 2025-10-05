/**
 * Urutan:
 *   - Baris yang belum terhapus (deleted_at IS NULL) diletakkan di atas,
 *   - Lalu urutkan created_at DESC di dalam masing-masing kelompok,
 *   - Baris yang terhapus (deleted_at IS NOT NULL) diletakkan di bawah.
 *
 * @param {Knex.QueryBuilder} query
 * @param {string} deletedCol   contoh: "topic.deleted_at"
 * @param {string} createdCol   contoh: "topic.created_at"
 */
function applyLatestThenTrashed(
  query,
  deletedCol = "deleted_at",
  createdCol = "created_at"
) {
  return query.orderByRaw(
    "CASE WHEN ?? IS NULL THEN 0 ELSE 1 END ASC, ?? DESC",
    [deletedCol, createdCol]
  );
}

module.exports = { applyLatestThenTrashed };
