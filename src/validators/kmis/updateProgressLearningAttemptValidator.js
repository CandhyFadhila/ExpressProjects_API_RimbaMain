const { body } = require("express-validator");

exports.updateProgressLearningAttemptValidator = [
  body("completedMaterial")
    .notEmpty()
    .withMessage("Tahapan Materi wajib diisi.")
    .bail()
    .isInt({ min: 0 })
    .withMessage("Tahapan Materi harus berupa bilangan bulat ≥ 0.")
    .toInt(),
];
