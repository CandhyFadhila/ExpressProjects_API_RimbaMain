const { body } = require("express-validator");
const knex = require("../../config/database");
const { hasAbility } = require("../../middlewares/requireAbility");

exports.storeMaterialValidator = [
  body("uploadedBy").custom(async (value, { req }) => {
    const isSuperAdmin = hasAbility(req, "super_admin");
    const isEducator = hasAbility(req, "educator");

    const raw = value == null ? "" : String(value).trim();

    if (!isSuperAdmin && isEducator && raw === "") {
      throw new Error("Pengajar wajib diisi.");
    }

    if (raw === "") return true;

    const idNum = Number(raw);
    if (!Number.isInteger(idNum) || idNum <= 0) {
      throw new Error("Pengajar harus berupa angka.");
    }

    const user = await knex("users")
      .where("id", idNum)
      .where("role_id", 2)
      .whereNull("deleted_at")
      .first();
    if (!user) {
      throw new Error(
        "Pengguna pengajar yang Anda pilih tidak ditemukan atau sudah dihapus."
      );
    }
    return true;
  }),

  // === materialTypes (wajib) + normalisasi ===
  body("materialTypes")
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
    .optional({ nullable: true, checkFalsy: true })
    .isString()
    .withMessage("materialData harus berupa teks.")
    .bail()
    .trim(),

  // === isPublic (opsional) ===
  body("isPublic")
    .optional({ nullable: true, checkFalsy: true })
    .isBoolean()
    .withMessage("isPublic harus berupa boolean.")
    .toBoolean(),
];
