const { body } = require("express-validator");

exports.updateFeedbackValidator = [
  body("feedback")
    .notEmpty()
    .withMessage("Feedback wajib diisi.")
    .bail()
    .isInt({ min: 0, max: 5 })
    .withMessage("Feedback harus berupa bilangan bulat 0 sampai 5.")
    .toInt(),

  body("comment")
    .trim()
    .notEmpty()
    .withMessage("Komentar tidak boleh kosong.")
    .bail()
    .isString()
    .withMessage("Komentar harus berupa teks."),
];
