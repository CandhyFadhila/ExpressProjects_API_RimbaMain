const { body } = require("express-validator");

exports.storeStudentValidator = [
  body("name")
    .notEmpty()
    .withMessage("Nama peserta tidak boleh kosong.")
    .bail()
    .isString()
    .withMessage("Nama peserta harus berupa teks.")
    .bail()
    .isLength({ max: 255 })
    .withMessage("Nama peserta maksimal 255 karakter."),

  body("email")
    .notEmpty()
    .withMessage("Email peserta tidak boleh kosong.")
    .bail()
    .isEmail()
    .withMessage(
      "Silahkan masukkan email yang valid, bisa berupa @gmail atau yang lain."
    )
    .bail()
    .isString()
    .withMessage("Email peserta harus berupa teks."),
];
