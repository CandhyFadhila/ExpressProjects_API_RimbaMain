const knex = require("../config/database");
const logger = require("../utils/logger");
const dateHelper = require("../helpers/dateHelper");

const ALLOWED_MODULES = new Set(["profile", "kmis", "cms", "monev"]);
const ALLOWED_KEYS = new Set(["create", "update", "delete", "restore"]);

class ActivityLogHelper {
  static table = "activity_logs";

  static fromReq(req) {
    // kembalikan user id atau null jika tidak ada
    return (
      req.auth?.userId ??
      req.auth?.user_id ??
      req.auth?.id ??
      req.userId ??
      req.user?.id ??
      null
    );
  }

  static _verbByKey(key) {
    switch (key) {
      case "create":
        return "Menambahkan";
      case "update":
        return "Memperbarui";
      case "delete":
        return "Menghapus";
      case "restore":
        return "Mengembalikan";
      default:
        return "Melakukan";
    }
  }

  static _buildAutoDescription({
    key,
    subject = "entitas",
    notes = null,
    now = new Date(),
  }) {
    const verb = this._verbByKey(key);
    const when = dateHelper.formatTanggalIndonesia(now, 2); // case 2: "Senin, 1 Januari 2025 pukul 15:30 WIB"
    let desc = `${verb} data '${subject}' pada '${when}'.`;
    if (notes) desc += ` ${notes}`; // opsional tambahan keterangan
    return desc;
  }

  static _normalize({
    userId = null,
    module,
    key,
    description = null,
    subject = null,
    notes = null,
  }) {
    if (!ALLOWED_MODULES.has(module)) {
      throw new Error(`activity_logs.module tidak valid: '${module}'`);
    }
    if (!ALLOWED_KEYS.has(key)) {
      throw new Error(`activity_logs.key tidak valid: '${key}'`);
    }

    // Jika description tidak diberikan, auto-generate dari template
    const finalDescription =
      description && String(description).trim().length
        ? description
        : this._buildAutoDescription({ key, subject, notes });

    return {
      user_id: userId ?? null,
      module,
      key,
      description: finalDescription,
      updated_at: knex.fn.now(),
    };
  }

  /**
   * Insert log. Gunakan trx jika tersedia agar atomic dengan operasi utama.
   * Param supported:
   * - userId
   * - module: 'profile' | 'kmis' | 'cms' | 'monev'
   * - key:    'create' | 'update' | 'delete' | 'restore'
   * - subject: string (contoh: 'topik') -> dipakai oleh auto-template
   * - notes:   string opsional, ditempel di akhir deskripsi
   * - description: jika diisi, override template
   */
  static async log(params, trx = null) {
    const row = this._normalize(params);
    const kx = trx || knex;

    const ret = await kx(this.table).insert(row).returning("id");
    const insertedId = Array.isArray(ret)
      ? typeof ret[0] === "object"
        ? ret[0].id
        : ret[0]
      : ret;
    return insertedId;
  }

  /**
   * Versi aman: kalau gagal, tulis warn tanpa melempar error.
   */
  static async tryLog(params, trx = null) {
    try {
      return await this.log(params, trx);
    } catch (e) {
      logger.warn(`| ActivityLog | - Gagal mencatat aktivitas: ${e.message}`);
      return null;
    }
  }

  // Helper kecil untuk pola umum
  static async logCreate(params, trx) {
    return this.tryLog({ ...params, key: "create" }, trx);
  }
  static async logUpdate(params, trx) {
    return this.tryLog({ ...params, key: "update" }, trx);
  }
  static async logDelete(params, trx) {
    return this.tryLog({ ...params, key: "delete" }, trx);
  }
  static async logRestore(params, trx) {
    return this.tryLog({ ...params, key: "restore" }, trx);
  }
}

module.exports = ActivityLogHelper;
