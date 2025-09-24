const { body } = require("express-validator");
const knex = require("../../config/database");

exports.updateNewsValidator = [
  body("categoryId")
    .notEmpty()
    .withMessage("Kategori berita wajib dipilih.")
    .bail()
    .isInt()
    .withMessage("Kategori berita harus berupa angka.")
    .bail()
    .custom(async (value) => {
      const category = await knex("cms_news_categories")
        .where("id", value)
        .whereNull("deleted_at")
        .first();
      if (!category) {
        throw new Error("Kategori berita yang Anda pilih tidak ditemukan.");
      }
      return true;
    }),

  body("title").notEmpty().withMessage("Judul berita tidak boleh kosong."),

  body("slug")
    .optional({ nullable: true, checkFalsy: true })
    .custom(() => true),

  body("description")
    .optional({ nullable: true, checkFalsy: true })
    .custom(() => true),

  body("newsContent")
    .optional({ nullable: true, checkFalsy: true })
    .custom(() => true),
];
