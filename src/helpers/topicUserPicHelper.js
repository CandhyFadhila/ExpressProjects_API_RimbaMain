// helpers/topicUserPicHelper.js
const knex = require("../config/database");

function resolveUserIdFromReq(req) {
  return req.userId ?? null;
}

/**
 * Menentukan apakah perlu filter topic berdasar user_pic.
 *
 * Aturan:
 * - Jika tidak ada auth / userId → tidak difilter (canSeeUserPic = false)
 * - Jika role_id = 1 → tidak difilter (canSeeUserPic = false)
 * - Selain itu:
 *    - cek apakah ada topic dengan user_pic yang mengandung userId
 *    - kalau ada → canSeeUserPic = true (filter aktif)
 *    - kalau tidak ada → canSeeUserPic = false (tidak difilter, biarkan kosong/semua sesuai filter lain)
 */
async function getUserPicFilterFlag(req) {
  const userIdRaw = resolveUserIdFromReq(req);
  if (!userIdRaw) {
    return { canSeeUserPic: false, userId: null };
  }

  const userId = Number(userIdRaw);

  const user = await knex("users")
    .where("id", userId)
    .select("role_id")
    .first();

  if (!user) {
    return { canSeeUserPic: false, userId: null };
  }

  // role_id = 1 → superadmin, abaikan filter user_pic
  if (Number(user.role_id) === 1) {
    return { canSeeUserPic: false, userId };
  }

  // cek apakah user ini memang muncul di salah satu topic.user_pic
  const existsTopic = await knex("kmis_topics")
    .whereRaw("user_pic @> ?", [JSON.stringify([userId])])
    .whereNull("deleted_at")
    .first();

  return { canSeeUserPic: !!existsTopic, userId };
}

module.exports = {
  getUserPicFilterFlag,
};
