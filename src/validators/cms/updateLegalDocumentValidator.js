const { body } = require("express-validator");

exports.updateLegalDocumentValidator = [
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
        throw new Error(
          "Kategori dokumen hukum yang Anda pilih tidak ditemukan."
        );
      }
      return true;
    }),

  body("title")
    .optional({ nullable: true, checkFalsy: true })
    .custom(() => true),

  body("description")
    .optional({ nullable: true, checkFalsy: true })
    .custom(() => true),
];
