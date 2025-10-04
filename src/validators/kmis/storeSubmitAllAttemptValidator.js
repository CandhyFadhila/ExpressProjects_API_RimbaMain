const { body } = require("express-validator");
const knex = require("../../config/database");

exports.storeSubmitAllAttemptValidator = [
  body("learningAttemptId")
    .notEmpty()
    .withMessage("Pembelajaran materi wajib dipilih.")
    .bail()
    .isInt()
    .withMessage("Pembelajaran materi harus berupa angka.")
    .bail()
    .custom(async (value) => {
      const row = await knex("kmis_learning_attempts")
        .where("id", value)
        .whereNull("deleted_at")
        .first();
      if (!row) {
        throw new Error("Pembelajaran materi yang dipilih tidak ditemukan.");
      }
      return true;
    }),
];
