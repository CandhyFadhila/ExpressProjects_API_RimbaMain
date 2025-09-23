const { body } = require("express-validator");
const knex = require("../../config/database");

exports.storeNewsValidator = [
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

  body("title")
    .notEmpty()
    .withMessage("Judul berita tidak boleh kosong.")
    .bail()
    .isString()
    .withMessage("Judul berita harus berupa teks.")
    .bail()
    .isLength({ max: 255 })
    .withMessage("Judul berita maksimal 255 karakter."),

  body("slug")
    .notEmpty()
    .withMessage("Slug berita tidak boleh kosong.")
    .bail()
    .isString()
    .withMessage("Slug berita harus berupa teks.")
    .bail()
    .isLength({ max: 255 })
    .withMessage("Slug berita maksimal 255 karakter."),

  body("description")
    .notEmpty()
    .withMessage("Deskripsi berita tidak boleh kosong.")
    .bail()
    .isString()
    .withMessage("Deskripsi berita harus berupa teks."),

  body("newsContent")
    .notEmpty()
    .withMessage("Konten berita tidak boleh kosong.")
    .bail()
    .isString()
    .withMessage("Konten berita harus berupa teks."),
];
