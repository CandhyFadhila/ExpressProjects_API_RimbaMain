const { body } = require("express-validator");

exports.updateShareReportValidator = [
  body("name")
    .notEmpty()
    .withMessage("Nama laporan tidak boleh kosong.")
    .bail()
    .isString()
    .withMessage("Nama laporan harus berupa teks.")
    .bail()
    .isLength({ max: 255 })
    .withMessage("Nama laporan maksimal 255 karakter."),

  body("description")
    .notEmpty()
    .withMessage("Deskripsi laporan tidak boleh kosong.")
    .bail()
    .isString()
    .withMessage("Deskripsi laporan harus berupa teks."),
];
