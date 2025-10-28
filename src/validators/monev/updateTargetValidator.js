const { body } = require("express-validator");

exports.updateTargetValidator = [
  body("description")
    .optional({ nullable: true, checkFalsy: true })
    .trim()
    .notEmpty()
    .withMessage("Deskripsi tidak boleh kosong bila dikirim.")
    .bail()
    .isString()
    .withMessage("Deskripsi harus berupa teks."),

  body("budgetTarget")
    .optional({ nullable: true, checkFalsy: true })
    .toInt()
    .isInt({ min: 0 })
    .withMessage("Target anggaran harus bilangan bulat >= 0."),

  body("physicalTarget")
    .optional({ nullable: true, checkFalsy: true })
    .toFloat()
    .isFloat({ min: 0 })
    .withMessage("Target fisik harus angka >= 0."),
];
