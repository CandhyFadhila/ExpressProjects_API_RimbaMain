const { body } = require("express-validator");

exports.storeMonevDashboardValidator = [
  body("hibahUSD")
    .notEmpty()
    .withMessage("Hibah dalam USD tidak boleh kosong.")
    .bail()
    .isInt()
    .withMessage("Hibah dalam USD harus berupa angka."),

  body("hibahIDR")
    .notEmpty()
    .withMessage("Hibah dalam IDR tidak boleh kosong.")
    .bail()
    .isInt()
    .withMessage("Hibah dalam IDR harus berupa angka."),

  body("description")
    .notEmpty()
    .withMessage("Deskripsi hibah tidak boleh kosong.")
    .bail()
    .isString()
    .withMessage("Deskripsi hibah harus berupa teks."),
];
