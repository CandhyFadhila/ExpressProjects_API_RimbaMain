const { body } = require("express-validator");
const knex = require("../../config/database");

exports.updateEventValidator = [
  body("categoryId")
    .notEmpty()
    .withMessage("Kategori kegiatan wajib dipilih.")
    .bail()
    .isInt()
    .withMessage("Kategori kegiatan harus berupa angka.")
    .bail()
    .custom(async (value) => {
      const category = await knex("cms_events_categories")
        .where("id", value)
        .whereNull("deleted_at")
        .first();
      if (!category) {
        throw new Error("Kategori kegiatan yang Anda pilih tidak ditemukan.");
      }
      return true;
    }),

  body("title")
    .trim()
    .notEmpty()
    .withMessage("Judul kegiatan tidak boleh kosong.")
    .bail()
    .isString()
    .withMessage("Judul kegiatan harus berupa teks.")
    .bail()
    .isLength({ max: 255 })
    .withMessage("Judul kegiatan maksimal 255 karakter."),

  body("description")
    .trim()
    .notEmpty()
    .withMessage("Deskripsi kegiatan tidak boleh kosong.")
    .bail()
    .isString()
    .withMessage("Deskripsi kegiatan harus berupa teks."),

  body("eventContent")
    .trim()
    .notEmpty()
    .withMessage("Konten kegiatan tidak boleh kosong.")
    .bail()
    .isString()
    .withMessage("Konten kegiatan harus berupa teks."),
];
