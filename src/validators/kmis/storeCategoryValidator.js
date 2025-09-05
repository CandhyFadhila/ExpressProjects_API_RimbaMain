const { body } = require("express-validator");

exports.storeCategoryValidator = [
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
    .withMessage("Deskripsi workspace tidak boleh kosong.")
    .bail()
    .isString()
    .withMessage("Deskripsi workspace harus berupa teks."),
];
