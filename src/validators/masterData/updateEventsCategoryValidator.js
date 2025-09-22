const { body } = require("express-validator");

exports.updateEventsCategoryValidator = [
  body("name")
    .trim()
    .notEmpty()
    .withMessage("Nama kategori kegiatan tidak boleh kosong.")
    .bail()
    .isString()
    .withMessage("Nama kategori kegiatan harus berupa teks.")
    .bail()
    .isLength({ max: 255 })
    .withMessage("Nama kategori kegiatan maksimal 255 karakter."),

  body("description")
    .trim()
    .notEmpty()
    .withMessage("Deskripsi kategori kegiatan tidak boleh kosong.")
    .bail()
    .isString()
    .withMessage("Deskripsi kategori kegiatan harus berupa teks."),
];
