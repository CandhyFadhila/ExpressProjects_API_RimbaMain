const { body } = require("express-validator");

exports.storeLegalDocumentValidator = [
  body("categoryId")
    .notEmpty()
    .withMessage("Kategori dokumen hukum wajib dipilih.")
    .bail()
    .isInt()
    .withMessage("Kategori dokumen hukum harus berupa angka.")
    .bail()
    .custom(async (value) => {
      const category = await knex("cms_legal_docs_categories")
        .where("id", value)
        .whereNull("deleted_at")
        .first();
      if (!category) {
        throw new Error("Kategori dokumen hukum yang Anda pilih tidak ditemukan.");
      }
      return true;
    }),

  body("title").custom((v) => {
    if (typeof v === "undefined")
      throw new Error("Judul kegiatan tidak boleh kosong.");
    return true;
  }),

  body("description").custom((v) => {
    if (typeof v === "undefined")
      throw new Error("Deskripsi kegiatan tidak boleh kosong.");
    return true;
  }),
];
