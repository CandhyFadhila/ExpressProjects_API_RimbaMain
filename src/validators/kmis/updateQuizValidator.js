const { body } = require("express-validator");
const knex = require("../../config/database");
const QUIZ_ALLOWED_ANSWER_TYPES = Object.freeze(["A", "B", "C", "D"]);

exports.updateQuizValidator = [
  body("categoryId")
    .notEmpty()
    .withMessage("Kategori wajib dipilih.")
    .bail()
    .isInt()
    .withMessage("Kategori harus berupa angka.")
    .bail()
    .custom(async (value) => {
      const category = await knex("kmis_categories")
        .where("id", value)
        .whereNull("deleted_at")
        .first();
      if (!category) {
        throw new Error("Kategori yang Anda pilih tidak ditemukan.");
      }
      return true;
    }),

  body("topicId")
    .notEmpty()
    .withMessage("Topik wajib dipilih.")
    .bail()
    .isInt()
    .withMessage("Topik harus berupa angka.")
    .bail()
    .custom(async (value) => {
      const topic = await knex("kmis_topics")
        .where("id", value)
        .whereNull("deleted_at")
        .first();
      if (!topic) {
        throw new Error("Topik yang Anda pilih tidak ditemukan.");
      }
      return true;
    }),

  body("question")
    .trim()
    .notEmpty()
    .withMessage("Soal pertanyaan tidak boleh kosong.")
    .bail()
    .isString()
    .withMessage("Soal pertanyaan harus berupa teks."),

  body("answerA")
    .trim()
    .notEmpty()
    .withMessage("Jawaban pilihan A tidak boleh kosong.")
    .bail()
    .isString()
    .withMessage("Jawaban pilihan A harus berupa teks."),

  body("answerB")
    .trim()
    .notEmpty()
    .withMessage("Jawaban pilihan B tidak boleh kosong.")
    .bail()
    .isString()
    .withMessage("Jawaban pilihan B harus berupa teks."),

  body("answerC")
    .trim()
    .notEmpty()
    .withMessage("Jawaban pilihan C tidak boleh kosong.")
    .bail()
    .isString()
    .withMessage("Jawaban pilihan C harus berupa teks."),

  body("answerD")
    .trim()
    .notEmpty()
    .withMessage("Jawaban pilihan D tidak boleh kosong.")
    .bail()
    .isString()
    .withMessage("Jawaban pilihan D harus berupa teks."),

  body("correctOption")
    .trim()
    .notEmpty()
    .withMessage("Tipe konten tidak boleh kosong.")
    .bail()
    .isString()
    .withMessage("Tipe konten harus berupa teks.")
    .bail()
    .isIn(QUIZ_ALLOWED_ANSWER_TYPES)
    .withMessage(
      `Jawaban harus salah satu dari: ${QUIZ_ALLOWED_ANSWER_TYPES.join(", ")}.`
    ),

  body("explanation")
    .customSanitizer((v) => {
      if (v === undefined || v === null) return null;
      const s = String(v).trim();
      return s === "" ? null : s;
    })
    .optional({ nullable: true })
    .isString()
    .withMessage("Penjelasan jawaban dari pertanyaan harus berupa teks."),
];
