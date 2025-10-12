const { body } = require("express-validator");
const knex = require("../config/database");
const dateHelper = require("../helpers/dateHelper");

const normalize = (s) =>
  String(s ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");

const isProtectedAccount = (selfId, roleName) => {
  const slug = String(roleName || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
  return Number(selfId) === 1 || slug === "super_admin";
};

const isProvided = (v) => {
  if (v === undefined || v === null) return false;
  const s = String(v).trim();
  if (!s) return false; // ""
  if (/^null$/i.test(s)) return false; // "null"
  if (/^undefined$/i.test(s)) return false; // "undefined"
  return true;
};

exports.profileValidator = [
  // NAME: unik (case-insensitive), maks 150
  body("name")
    .optional({ nullable: true, checkFalsy: true })
    .if((value) => isProvided(value))
    .isString()
    .withMessage("Nama harus berupa teks.")
    .bail()
    .trim()
    .isLength({ max: 150 })
    .withMessage("Nama maksimal 150 karakter.")
    .bail()
    .custom(async (name, { req }) => {
      const selfId = Number(req.auth?.userId) ?? Number(req.params?.id) ?? null;

      // Ambil data diri + role untuk validasi akun terlindungi
      const me = Number.isFinite(selfId)
        ? await knex("users as u")
            .leftJoin("roles as r", "r.id", "u.role_id")
            .select("u.id", "u.name as current_name", "r.name as role_name")
            .where("u.id", selfId)
            .whereNull("u.deleted_at")
            .first()
        : null;

      if (me && isProtectedAccount(selfId, me.role_name)) {
        if (normalize(name) !== normalize(me.current_name)) {
          throw new Error("Akun super admin tidak boleh mengubah nama.");
        }
        // Jika sama, lanjutkan (tetap boleh melewati validator)
        return true;
      }

      // Cek unik (abaikan baris sendiri)
      const exists = await knex("users")
        .select("id")
        .whereNull("deleted_at")
        .whereRaw("LOWER(name) = LOWER(?)", [name])
        .modify((q) => {
          if (Number.isFinite(selfId)) q.andWhereNot("id", selfId);
        })
        .first();

      if (exists) throw new Error("Nama sudah digunakan.");
      return true;
    }),

  // EMAIL: format valid + unik (CITEXT sudah case-insensitive)
  body("email")
    .optional({ nullable: true, checkFalsy: true })
    .if((value) => isProvided(value))
    .isString()
    .withMessage("Email harus berupa teks.")
    .bail()
    .trim()
    .isEmail()
    .withMessage("Silakan masukkan email yang valid.")
    .isLength({ max: 254 })
    .withMessage("Email maksimal 254 karakter.")
    .bail()
    .custom(async (email, { req }) => {
      const selfId = Number(req.auth?.userId) ?? Number(req.params?.id) ?? null;

      // Ambil data diri + role untuk validasi akun terlindungi
      const me = Number.isFinite(selfId)
        ? await knex("users as u")
            .leftJoin("roles as r", "r.id", "u.role_id")
            .select("u.id", "u.email as current_email", "r.name as role_name")
            .where("u.id", selfId)
            .whereNull("u.deleted_at")
            .first()
        : null;

      if (me && isProtectedAccount(selfId, me.role_name)) {
        const newNorm = String(email).trim().toLowerCase();
        const curNorm = String(me.current_email || "")
          .trim()
          .toLowerCase();
        if (newNorm !== curNorm) {
          throw new Error("Akun super admin tidak boleh mengubah email.");
        }
        // Jika sama, lanjutkan
        return true;
      }

      // Cek unik (CITEXT sudah case-insensitive)
      const exists = await knex("users")
        .select("id")
        .whereNull("deleted_at")
        .where("email", email)
        .modify((q) => {
          if (Number.isFinite(selfId)) q.andWhereNot("id", selfId);
        })
        .first();

      if (exists) throw new Error("Email ini sudah digunakan.");
      return true;
    }),

  // BIRTH DATE: input wajib ISO 8601 (punya Z/offset), lalu di-konversi -> 'YYYY-MM-DD' (UTC)
  body("birthDate")
    .optional({ nullable: true, checkFalsy: true })
    .if((value) => isProvided(value))
    .custom((v) => {
      if (!dateHelper.isIso8601Z(v)) {
        throw new Error(
          "Tanggal lahir harus ISO 8601 dengan Z/offset, contoh: 1990-05-17T00:00:00+07:00 atau 1990-05-16T17:00:00Z."
        );
      }
      const dUTC = dateHelper.toUTC(v);
      if (!dUTC) throw new Error("Tanggal lahir tidak valid.");

      // Validasi rentang & future
      const now = new Date();
      const todayUTC = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
      );
      const min = new Date("1900-01-01T00:00:00.000Z");
      if (dUTC > todayUTC)
        throw new Error("Tanggal lahir tidak boleh di masa depan.");
      if (dUTC < min) throw new Error("Tanggal lahir tidak masuk akal.");
      return true;
    }),

  // GENDER: 0 atau 1
  body("gender")
    .optional({ nullable: true, checkFalsy: true })
    .if((value) => isProvided(value))
    .custom((v) => {
      const n = Number(v);
      if (!Number.isInteger(n) || ![0, 1].includes(n)) {
        throw new Error("Gender hanya boleh 0 atau 1.");
      }
      return true;
    }),

  // PHONE NUMBER: maks 30, karakter aman
  body("phoneNumber")
    .optional({ nullable: true, checkFalsy: true })
    .if((value) => isProvided(value))
    .isString()
    .withMessage("Nomor telepon harus berupa teks.")
    .bail()
    .trim()
    .isLength({ max: 30 })
    .withMessage("Nomor telepon maksimal 30 karakter."),

  // PROFESSION: maks 100
  body("profession")
    .optional({ nullable: true, checkFalsy: true })
    .if((value) => isProvided(value))
    .isString()
    .withMessage("Profesi harus berupa teks.")
    .bail()
    .trim()
    .isLength({ max: 100 })
    .withMessage("Profesi maksimal 100 karakter."),

  // ADDRESS: batasi panjang
  body("address")
    .optional({ nullable: true, checkFalsy: true })
    .if((value) => isProvided(value))
    .isString()
    .withMessage("Alamat harus berupa teks.")
    .bail()
    .trim()
    .isLength({ max: 2000 })
    .withMessage("Alamat terlalu panjang (maksimal 2000 karakter)."),
];
