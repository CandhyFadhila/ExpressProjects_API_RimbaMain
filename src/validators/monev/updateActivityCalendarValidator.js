const { body } = require("express-validator");
const knex = require("../../config/database");
const dateHelper = require("../../helpers/dateHelper");

const dayjs = require("dayjs");
const utc = require("dayjs/plugin/utc");
const timezone = require("dayjs/plugin/timezone");
dayjs.extend(utc);
dayjs.extend(timezone);

const TIME_COLON_STRICT = /^([01]\d|2[0-3]):([0-5]\d):([0-5]\d)$/; // HH:mm:ss
const TIME_DOT_STRICT = /^([01]\d|2[0-3])\.([0-5]\d)\.([0-5]\d)$/; // HH.mm.ss

function normalizeToHHMMSS(v) {
  const s = String(v || "").trim();
  if (TIME_COLON_STRICT.test(s)) return s; // sudah HH:mm:ss
  const m = s.match(TIME_DOT_STRICT);
  if (m) {
    const [, hh, mm, ss] = m;
    return `${hh}:${mm}:${ss}`; // konversi ke HH:mm:ss
  }
  return s;
}

exports.updateActivityCalendarValidator = [
  body("activityCategoryId")
    .notEmpty()
    .withMessage("Kategori aktivitas wajib dipilih.")
    .bail()
    .isInt()
    .withMessage("Kategori aktivitas harus berupa angka.")
    .bail()
    .custom(async (value) => {
      const category = await knex("monev_activity_categories")
        .where("id", value)
        .whereNull("deleted_at")
        .first();
      if (!category)
        throw new Error("Kategori aktivitas yang Anda pilih tidak ditemukan.");
      return true;
    }),

  body("name")
    .notEmpty()
    .withMessage("Nama kegiatan tidak boleh kosong.")
    .bail()
    .isString()
    .withMessage("Nama kegiatan harus berupa teks.")
    .bail()
    .isLength({ max: 255 })
    .withMessage("Nama kegiatan maksimal 255 karakter."),

  body("description")
    .optional({ nullable: true, checkFalsy: true })
    .isString()
    .withMessage("Deskripsi harus berupa teks."),

  body("location")
    .notEmpty()
    .withMessage("Lokasi tidak boleh kosong.")
    .bail()
    .isString()
    .withMessage("Lokasi harus berupa teks.")
    .bail()
    .isLength({ max: 200 })
    .withMessage("Lokasi maksimal 200 karakter."),

  body("startedDate")
    .notEmpty()
    .withMessage(
      "Tanggal mulai wajib diisi (ISO 8601 dengan Z/offset), contoh: 1990-05-17T00:00:00+07:00 atau 1990-05-16T17:00:00Z."
    )
    .bail()
    .custom((v) => {
      if (!dateHelper.isIso8601Z(v)) {
        throw new Error(
          "Tanggal mulai harus ISO 8601 dengan Z/offset, contoh: 1990-05-17T00:00:00+07:00 atau 1990-05-16T17:00:00Z."
        );
      }
      const dUTC = dateHelper.toUTC(v);
      if (!dUTC) throw new Error("Tanggal mulai tidak valid.");
      return true;
    }),

  body("finishedDate")
    .notEmpty()
    .withMessage(
      "Tanggal selesai wajib diisi (ISO 8601 dengan Z/offset), contoh: 1990-05-17T00:00:00+07:00 atau 1990-05-16T17:00:00Z."
    )
    .bail()
    .custom((v) => {
      if (!dateHelper.isIso8601Z(v)) {
        throw new Error(
          "Tanggal selesai harus ISO 8601 dengan Z/offset, contoh: 1990-05-17T00:00:00+07:00 atau 1990-05-16T17:00:00Z."
        );
      }
      const dUTC = dateHelper.toUTC(v);
      if (!dUTC) throw new Error("Tanggal selesai tidak valid.");
      return true;
    }),

  body("startedTime")
    .notEmpty()
    .withMessage("Jam mulai wajib diisi (format HH:mm:ss).")
    .bail()
    .custom((v) => {
      const s = String(v || "").trim();
      return TIME_COLON_STRICT.test(s) || TIME_DOT_STRICT.test(s);
    })
    .withMessage("Format jam mulai tidak valid. Gunakan HH:mm:ss (24 jam).")
    .bail()
    .customSanitizer((v) => normalizeToHHMMSS(v)),

  body("finishedTime")
    .notEmpty()
    .withMessage("Jam selesai wajib diisi (format HH:mm:ss atau HH.mm.ss).")
    .bail()
    .custom((v) => {
      const s = String(v || "").trim();
      return TIME_COLON_STRICT.test(s) || TIME_DOT_STRICT.test(s);
    })
    .withMessage(
      "Format jam selesai tidak valid. Gunakan HH:mm:ss atau HH.mm.ss (24 jam)."
    )
    .bail()
    .customSanitizer((v) => normalizeToHHMMSS(v)),
];
