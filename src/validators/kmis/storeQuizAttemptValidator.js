const { body } = require("express-validator");
const knex = require("../../config/database");
const dateHelper = require("../../helpers/dateHelper");
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

  body("answeredAt")
    .notEmpty()
    .withMessage("Tanggal ujian tidak boleh kosong.")
    .bail()
    .if((value) => isProvided(value))
    .custom((v) => {
      if (!dateHelper.isIso8601Z(v)) {
        throw new Error(
          "Tanggal ujian harus ISO 8601 dengan Z/offset, contoh: 2025-10-02T10:00:00+07:00 atau 2025-10-02T03:00:00Z."
        );
      }
      const dUTC = dateHelper.toUTC(v);
      if (!dUTC) throw new Error("Tanggal ujian tidak valid.");
      const now = new Date();
      if (dUTC > now)
        throw new Error("Tanggal ujian tidak boleh di masa depan.");
      const min = new Date("1900-01-01T00:00:00.000Z");
      if (dUTC < min) throw new Error("Tanggal ujian tidak masuk akal.");
      return true;
    }),
];
