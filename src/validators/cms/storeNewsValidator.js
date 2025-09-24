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

  body("title").custom((v) => {
    if (typeof v === "undefined")
      throw new Error("Judul berita tidak boleh kosong.");
    return true;
  }),

  body("slug").custom((v) => {
    if (typeof v === "undefined")
      throw new Error("Slug berita tidak boleh kosong.");
    return true;
  }),

  body("description").custom((v) => {
    if (typeof v === "undefined")
      throw new Error("Deskripsi berita tidak boleh kosong.");
    return true;
  }),

  body("newsContent").custom((v) => {
    if (typeof v === "undefined")
      throw new Error("Konten berita tidak boleh kosong.");
    return true;
  }),
];
