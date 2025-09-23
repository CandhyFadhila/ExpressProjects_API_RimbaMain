const { body } = require("express-validator");
const knex = require("../../config/database");

exports.updateTopicValidator = [
  body("categoryId")
    .optional({ nullable: true, checkFalsy: true })
    .bail()
    .isInt()
    .withMessage("Kategori topik harus berupa angka.")
    .bail()
    .custom(async (value) => {
      const category = await knex("kmis_categories")
        .where("id", value)
        .whereNull("deleted_at")
        .first();
      if (!category) {
        throw new Error("Kategori topik yang Anda pilih tidak ditemukan.");
      }
      return true;
    }),

  body("title")
    .notEmpty()
    .withMessage("Judul topik tidak boleh kosong.")
    .bail()
    .isString()
    .withMessage("Judul topik harus berupa teks.")
    .bail()
    .isLength({ max: 255 })
    .withMessage("Judul topik maksimal 255 karakter."),

  body("description")
    .notEmpty()
    .withMessage("Deskripsi topik tidak boleh kosong.")
    .bail()
    .isString()
    .withMessage("Deskripsi topik harus berupa teks."),
];
