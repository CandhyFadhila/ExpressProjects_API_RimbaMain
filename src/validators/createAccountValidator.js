const { body } = require("express-validator");

exports.createAccountValidator = [
  body("name")
    .notEmpty()
    .withMessage("Nama tidak boleh kosong.")
    .bail()
    .isString()
    .withMessage("Nama harus berupa teks.")
    .bail()
    .isLength({ max: 255 })
    .withMessage("Nama maksimal 255 karakter."),

  body("email")
    .notEmpty()
    .withMessage("Email tidak boleh kosong.")
    .bail()
    .isEmail()
    .withMessage(
      "Silahkan masukkan email yang valid, bisa berupa @gmail atau yang lain."
    ),

  body("password")
    .notEmpty()
    .withMessage("Password tidak boleh kosong.")
    .bail()
    .isLength({ min: 8 })
    .withMessage("Password minimal terdiri dari 8 karakter."),

  body("passwordConfirmation")
    .notEmpty()
    .withMessage("Password konfirmasi tidak boleh kosong.")
    .bail()
    .isLength({ min: 8 })
    .withMessage("Password konfirmasi minimal terdiri dari 8 karakter.")
    .bail()
    .custom((value, { req }) => {
      if (value !== req.body.password) {
        throw new Error("Password konfirmasi tidak cocok.");
      }
      return true;
    }),
];
