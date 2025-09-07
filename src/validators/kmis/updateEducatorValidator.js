const { body } = require("express-validator");

exports.updateEducatorValidator = [
  body("name")
    .notEmpty()
    .withMessage("Nama pengajar tidak boleh kosong.")
    .bail()
    .isString()
    .withMessage("Nama pengajar harus berupa teks.")
    .bail()
    .isLength({ max: 255 })
    .withMessage("Nama pengajar maksimal 255 karakter."),

  body("email")
    .notEmpty()
    .withMessage("Email pengajar tidak boleh kosong.")
    .bail()
    .isEmail()
    .withMessage(
      "Silahkan masukkan email yang valid, bisa berupa @gmail atau yang lain."
    )
    .bail()
    .isString()
    .withMessage("Email pengajar harus berupa teks."),
];
