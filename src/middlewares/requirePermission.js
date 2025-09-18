const WithoutDataResource = require("../resources/WithoutDataResource");
const logger = require("../utils/logger");
const knex = require("../config/database");
const { resolveArrayRelations } = require("../helpers/resolveArrayRelations");

// util: normalisasi ke array lowercase
function normalizeList(v) {
  const arr = Array.isArray(v) ? v : [v];
  return arr.filter(Boolean).map((s) => String(s).trim().toLowerCase());
}

/**
 * requirePermission(required, options)
 * - required: "view.kmis_category" | ["view.kmis_category", "create.kmis_category"]
 * - options.mode: "any" (default) | "all"
 */
module.exports = function requirePermission(required, options = {}) {
  const mode = options.mode === "all" ? "all" : "any";
  const requiredList = normalizeList(required);

  return async (req, res, next) => {
    try {
      if (!req.userId) {
        const response = new WithoutDataResource(
          401,
          "UNAUTHORIZED",
          "Akses Ditolak",
          "Token tidak valid atau sesi tidak ditemukan."
        );
        return res.status(401).json(response.toResponse());
      }

      // 1) pakai permission dari token bila tersedia
      let userPerms = Array.isArray(req.auth?.permissions)
        ? normalizeList(req.auth.permissions)
        : null;

      // 2) kalau tidak ada di token, ambil dari DB (role -> permission_ids -> permissions.key)
      if (!userPerms) {
        const row = await knex("users as u")
          .leftJoin("roles as r", "r.id", "u.role_id")
          .where("u.id", req.userId)
          .select("r.permission_ids")
          .first();

        const keys = await resolveArrayRelations(
          row?.permission_ids,
          "permissions",
          (p) => (p?.key ? String(p.key).trim().toLowerCase() : null)
        );

        userPerms = normalizeList(keys);
        // simpan ke req.auth biar reusable di handler berikutnya
        req.auth = req.auth || {};
        req.auth.permissions = userPerms;
      }

      if (userPerms.length === 0) {
        const response = new WithoutDataResource(
          403,
          "NO_ACCESS",
          "Tidak Memiliki Akses",
          "Anda tidak memiliki permission yang dibutuhkan."
        );
        return res.status(403).json(response.toResponse());
      }

      const set = new Set(userPerms);
      const ok =
        mode === "all"
          ? requiredList.every((k) => set.has(k))
          : requiredList.some((k) => set.has(k));

      if (!ok) {
        logger.info(
          `| Permission | - Denied userId=${
            req.userId
          }; need(${mode})=[${requiredList.join(", ")}], has=[${userPerms.join(
            ", "
          )}]`
        );
        const response = new WithoutDataResource(
          403,
          "NO_ACCESS",
          "Tidak Memiliki Akses",
          "Anda tidak memiliki akses untuk mengakses halaman ini."
        );
        return res.status(403).json(response.toResponse());
      }

      next();
    } catch (err) {
      logger.error(`| Permission | - Error: ${err.message}`);
      const response = new WithoutDataResource(
        500,
        "SERVER_ERROR",
        "Server Sedang Error",
        "Terjadi kesalahan pada sistem, silahkan coba lagi nanti atau hubungi admin."
      );
      res.status(500).json(response.toResponse());
    }
  };
};
