const { body } = require("express-validator");
const knex = require("../../config/database");
const QUIZ_ALLOWED_ANSWER_TYPES = Object.freeze(["A", "B", "C", "D"]);

exports.storeQuizAttemptValidator = [
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

  body("quizId")
    .notEmpty()
    .withMessage("Kuis wajib dipilih.")
    .bail()
    .isInt()
    .withMessage("Kuis harus berupa angka.")
    .bail()
    .custom(async (value) => {
      const learningAttempt = await knex("kmis_quiz")
        .where("id", value)
        .whereNull("deleted_at")
        .first();
      if (!learningAttempt) {
        throw new Error("Kuis yang Anda pilih tidak ditemukan.");
      }
      return true;
    }),

  body("selectedOption")
    .trim()
    .notEmpty()
    .withMessage("Jawaban tidak boleh kosong.")
    .bail()
    .isString()
    .withMessage("Jawaban harus berupa teks.")
    .bail()
    .customSanitizer((v) => String(v).trim().toUpperCase())
    .isIn(QUIZ_ALLOWED_ANSWER_TYPES)
    .withMessage(
      `Jawaban harus salah satu dari: ${QUIZ_ALLOWED_ANSWER_TYPES.join(", ")}.`
    ),

  body("isMarker")
    .optional()
    .isBoolean()
    .withMessage("Penanda soal harus berupa boolean.")
    .toBoolean(),
];
