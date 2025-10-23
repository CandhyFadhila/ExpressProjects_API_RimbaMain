const { body } = require("express-validator");
const knex = require("../../config/database");

exports.storeMaterialValidator = [
  // === materialType (wajib) + normalisasi ===
  body("materialType")
    .notEmpty()
    .withMessage("Tipe materi wajib diisi.")
    .bail()
    .isString()
    .withMessage("Tipe materi harus berupa teks.")
    .bail()
    .customSanitizer((v) => {
      const s = String(v || "")
        .trim()
        .toLowerCase();
      return s === "teks" ? "text" : s;
    })
    .isIn(["text", "gambar", "video", "dokumen"])
    .withMessage("Tipe materi hanya boleh berisikan text, gambar, video, atau dokumen."),

  // === title (wajib untuk semua) ===
  body("title")
    .notEmpty()
    .withMessage("Judul materi wajib diisi.")
    .bail()
    .isString()
    .withMessage("Judul materi harus berupa teks.")
    .bail()
    .isLength({ max: 180 })
    .withMessage("Judul materi maksimal 180 karakter."),

  // === description (wajib untuk semua) ===
  body("description")
    .notEmpty()
    .withMessage("Deskripsi materi wajib diisi.")
    .bail()
    .isString()
    .withMessage("Deskripsi materi harus berupa teks."),

  // === topicId (wajib jika gambar/dokumen) ===
  body("topicId")
    .notEmpty()
    .withMessage("Topik materi wajib dipilih untuk tipe gambar/dokumen.")
    .bail()
    .isInt({ gt: 0 })
    .withMessage("Topik materi harus berupa angka.")
    .bail()
    .custom(async (value, { req }) => {
      const topic = await knex("kmis_topics")
        .where("id", value)
        .whereNull("deleted_at")
        .first();
      if (!topic) {
        throw new Error(
          "Topik materi yang Anda pilih tidak ditemukan atau sudah dihapus."
        );
      }
    }),

  // === materialUrl (wajib untuk video; opsional untuk lainnya) ===
  body("materialUrl")
    .if(body("materialType").equals("video"))
    .notEmpty()
    .withMessage("materialUrl wajib diisi untuk tipe video.")
    .bail()
    .isString()
    .withMessage("materialUrl harus berupa teks."),

  body("materialUrl")
    .if(body("materialType").not().equals("video"))
    .optional({ nullable: true, checkFalsy: true })
    .isString()
    .withMessage("materialUrl harus berupa teks.")
    .bail()
    .trim(),

  // === isPublic (opsional) ===
  body("isPublic")
    .optional({ nullable: true, checkFalsy: true })
    .isBoolean()
    .withMessage("isPublic harus berupa boolean.")
    .toBoolean(),
];
