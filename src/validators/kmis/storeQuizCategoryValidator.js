const { body } = require("express-validator");
const knex = require("../../config/database");

exports.storeQuizCategoryValidator = [
  body("categoryId")
    .notEmpty()
    .withMessage("Kategori wajib dipilih.")
    .bail()
    .isInt()
    .withMessage("Kategori harus berupa angka.")
    .bail()
    .custom(async (value) => {
      const category = await knex("kmis_categories")
        .where("id", value)
        .whereNull("deleted_at")
        .first();
      if (!category) {
        throw new Error("Kategori yang Anda pilih tidak ditemukan.");
      }
      return true;
    }),

  body("topicId")
    .notEmpty()
    .withMessage("Topik wajib dipilih.")
    .bail()
    .isInt()
    .withMessage("Topik harus berupa angka.")
    .bail()
    .custom(async (value) => {
      const topic = await knex("kmis_topics")
        .where("id", value)
        .whereNull("deleted_at")
        .first();
      if (!topic) {
        throw new Error("Topik yang Anda pilih tidak ditemukan.");
      }
      return true;
    }),

  body("name")
    .notEmpty()
    .withMessage("Nama kategori tidak boleh kosong.")
    .bail()
    .isString()
    .withMessage("Nama kategori harus berupa teks.")
    .bail()
    .isLength({ max: 150 })
    .withMessage("Nama kategori maksimal 150 karakter."),

  body("totalQuestion")
    .trim()
    .notEmpty()
    .withMessage("Jumlah soal pertanyaan tidak boleh kosong.")
    .bail()
    .isInt()
    .withMessage("Jumlah soal pertanyaan harus berupa angka."),

  body("description")
    .customSanitizer((v) => {
      if (v === undefined || v === null) return null;
      const s = String(v).trim();
      return s === "" ? null : s;
    })
    .optional({ nullable: true })
    .isString()
    .withMessage("Deskripsi harus berupa teks."),
];
