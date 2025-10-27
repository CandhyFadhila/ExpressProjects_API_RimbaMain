const { body } = require("express-validator");

exports.updateMonevDashboardValidator = [
  body("hibah")
    .notEmpty()
    .withMessage("Hibah tidak boleh kosong.")
    .bail()
    .isInt()
    .withMessage("Hibah harus berupa angka."),

  body("description")
    .notEmpty()
    .withMessage("Deskripsi hibah tidak boleh kosong.")
    .bail()
    .isString()
    .withMessage("Deskripsi hibah harus berupa teks."),
];
