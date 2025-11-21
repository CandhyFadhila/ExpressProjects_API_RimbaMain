const { body } = require("express-validator");
const knex = require("../../config/database");

exports.updateTopicValidator = [
  body("categoryId")
    .optional({ nullable: true, checkFalsy: true })
    .bail()
    .isInt()
    .withMessage("Kategori topik harus berupa angka.")
    .bail()
    .custom(async (value) => {
      const category = await knex("kmis_categories").where("id", value).first();
      if (!category) {
        throw new Error("Kategori topik yang Anda pilih tidak ditemukan.");
      }
      return true;
    }),

  body("topicType")
    .notEmpty()
    .withMessage("Tipe topik tidak boleh kosong.")
    .isIn(["Pengetahuan", "Pelatihan"])
    .withMessage("Tipe topik harus salah satu dari Pengetahuan dan Pelatihan."),

  body("title")
    .notEmpty()
    .withMessage("Judul topik tidak boleh kosong.")
    .bail()
    .isString()
    .withMessage("Judul topik harus berupa teks.")
    .bail()
    .isLength({ max: 255 })
    .withMessage("Judul topik maksimal 255 karakter."),

  body("description")
    .notEmpty()
    .withMessage("Deskripsi topik tidak boleh kosong.")
    .bail()
    .isString()
    .withMessage("Deskripsi topik harus berupa teks."),

  body("totalQuiz")
    .if(body("topicType").equals("Pelatihan"))
    .notEmpty()
    .withMessage(
      "Jumlah soal pertanyaan wajib diisi untuk tipe topik Pelatihan."
    )
    .bail()
    .isInt()
    .withMessage("Jumlah soal pertanyaan harus berupa angka."),

  body("quizDuration")
    .if(body("topicType").equals("Pelatihan"))
    .notEmpty()
    .withMessage(
      "Waktu penyelesaian pertanyaan wajib diisi untuk tipe topik Pelatihan."
    )
    .bail()
    .isInt()
    .withMessage(
      "Waktu penyelesaian pertanyaan harus berupa angka dan satuan detik."
    ),
];
