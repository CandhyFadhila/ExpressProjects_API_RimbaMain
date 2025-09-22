const { body } = require("express-validator");

exports.updateNewsCategoryValidator = [
  body("name")
    .notEmpty()
    .withMessage("Nama kategori berita tidak boleh kosong.")
    .bail()
    .isString()
    .withMessage("Nama kategori berita harus berupa teks.")
    .bail()
    .isLength({ max: 255 })
    .withMessage("Nama kategori berita maksimal 255 karakter."),

  body("description")
    .notEmpty()
    .withMessage("Deskripsi kategori berita tidak boleh kosong.")
    .bail()
    .isString()
    .withMessage("Deskripsi kategori berita harus berupa teks."),
];
