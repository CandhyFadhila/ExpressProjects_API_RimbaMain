function normalizeAbilities(arr) {
  return Array.isArray(arr) ? arr.map((a) => String(a).toLowerCase()) : [];
}

function getAuthFlags(req) {
  const roleNameLower = String(req?.auth?.roleName || "").toLowerCase();
  const abilitiesLower = normalizeAbilities(req?.auth?.abilities);
  const hasAbility = (a) => abilitiesLower.includes(String(a).toLowerCase());

  const isSuperAdmin = roleNameLower === "super admin" || hasAbility("super_admin");
  const isEducator   = roleNameLower === "educator"   || hasAbility("educator");
  const isStudent    = roleNameLower === "student"    || hasAbility("student");

  return { isSuperAdmin, isEducator, isStudent, roleNameLower, abilitiesLower, hasAbility };
}

/**
 * Rules:
 * - Super admin:
 *   - with_trashed === "0" -> hanya yang tidak terhapus (WHERE ... IS NULL)
 *   - selain itu (""/undefined/"1") -> tampilkan semua (tanpa filter)
 * - Non super admin:
 *   - selalu hanya yang tidak terhapus
 */
function applyTrashedScope(query, req, column = "deleted_at") {
  const { isSuperAdmin } = getAuthFlags(req);
  const wt = String(req?.query?.with_trashed ?? "").trim();

  if (isSuperAdmin) {
    if (wt === "0") {
      query.whereNull(column);
    }
    // default atau "1" -> tanpa filter (termasuk soft delete)
  } else {
    query.whereNull(column);
  }
  return query;
}

module.exports = { getAuthFlags, applyTrashedScope };