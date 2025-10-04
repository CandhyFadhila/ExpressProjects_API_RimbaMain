const { body } = require("express-validator");
const knex = require("../../config/database");

exports.storeLearningAttemptValidator = [
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
];
