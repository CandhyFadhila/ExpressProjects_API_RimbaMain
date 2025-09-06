const { body } = require("express-validator");

exports.updateCategoryValidator = [
  body("title")
    .notEmpty()
    .withMessage("Judul kategori tidak boleh kosong.")
    .bail()
    .isString()
    .withMessage("Judul kategori harus berupa teks.")
    .bail()
    .isLength({ max: 255 })
    .withMessage("Judul kategori maksimal 255 karakter."),

  body("description")
    .notEmpty()
    .withMessage("Deskripsi kategori tidak boleh kosong.")
    .bail()
    .isString()
    .withMessage("Deskripsi kategori harus berupa teks."),
];
