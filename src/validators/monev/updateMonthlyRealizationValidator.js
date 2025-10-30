const { body } = require("express-validator");

exports.updateMonthlyRealizationValidator = [
  body("description")
    .optional({ nullable: true, checkFalsy: true })
    .trim()
    .bail()
    .isString()
    .withMessage("Deskripsi harus berupa teks."),

  body("progress")
    .notEmpty()
    .withMessage("Progres tidak boleh kosong.")
    .bail()
    .toInt()
    .isInt({ min: 0, max: 100 })
    .withMessage("Progres harus bilangan bulat 0 s.d 100."),

  body("problem")
    .notEmpty()
    .withMessage("Permasalahan tidak boleh kosong.")
    .bail()
    .trim()
    .notEmpty()
    .withMessage("Permasalahan tidak boleh kosong.")
    .bail()
    .isString()
    .withMessage("Permasalahan harus berupa teks."),
];
