const { body } = require("express-validator");
const knex = require("../../config/database");

exports.updateMaterialValidator = [
  // === materialTypes (wajib) + normalisasi ===
  body("materialTypes")
    .optional({ nullable: true, checkFalsy: true })
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
    .withMessage(
      "Tipe materi hanya boleh berisikan text, gambar, video, atau dokumen."
    ),

  // === title (wajib untuk semua) ===
  body("title")
    .optional({ nullable: true, checkFalsy: true })
    .bail()
    .isString()
    .withMessage("Judul materi harus berupa teks.")
    .bail()
    .isLength({ max: 180 })
    .withMessage("Judul materi maksimal 180 karakter."),

  // === description (wajib untuk semua) ===
  body("description")
    .optional({ nullable: true, checkFalsy: true })
    .bail()
    .isString()
    .withMessage("Deskripsi materi harus berupa teks."),

  // === categoryId (wajib jika gambar/dokumen) ===
  body("categoryId")
    .if(body("materialTypes").isIn(["gambar", "dokumen"]))
    .notEmpty()
    .withMessage("Kategori materi wajib dipilih untuk tipe gambar/dokumen.")
    .bail()
    .isInt({ gt: 0 })
    .withMessage("Kategori materi harus berupa angka.")
    .bail()
    .custom(async (value) => {
      const category = await knex("kmis_categories")
        .where("id", value)
        .whereNull("deleted_at")
        .first();
      if (!category) {
        throw new Error(
          "Kategori materi yang Anda pilih tidak ditemukan atau sudah dihapus."
        );
      }
      return true;
    }),

  // === topicId (wajib jika gambar/dokumen) + konsistensi ke categoryId ===
  body("topicId")
    .if(body("materialTypes").isIn(["gambar", "dokumen"]))
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
      // Cek kesesuaian topic vs category bila categoryId dikirim
      if (
        req.body.categoryId != null &&
        Number(req.body.categoryId) !== Number(topic.kmis_categories_id)
      ) {
        throw new Error("Topik tidak sesuai dengan kategori yang dipilih.");
      }
      return true;
    }),

  // === materialData (wajib untuk video; opsional untuk lainnya) ===
  body("materialData")
    .if(body("materialTypes").equals("video"))
    .notEmpty()
    .withMessage("materialData wajib diisi untuk tipe video.")
    .bail()
    .isString()
    .withMessage("materialData harus berupa teks."),

  body("materialData")
    .if(body("materialTypes").not().equals("video"))
    .optional({ nullable: true })
    .isString()
    .withMessage("materialData harus berupa teks.")
    .bail()
    .trim(),

  // === isPublic (opsional) ===
  body("isPublic")
    .optional({ nullable: true })
    .isBoolean()
    .withMessage("isPublic harus berupa boolean.")
    .toBoolean(),
];
