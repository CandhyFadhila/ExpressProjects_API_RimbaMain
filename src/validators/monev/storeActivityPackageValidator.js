const { body } = require("express-validator");
const knex = require("../../config/database");
const ALLOWED_CONTRACT_TYPES = Object.freeze([
  "Swakelola 1",
  "Swakelola 2",
  "Swakelola 3",
  "Kontraktual",
]);
const ALLOWED_MONTHS = Object.freeze([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);

exports.storeActivityPackageValidator = [
  body("picDivisionId")
    .notEmpty()
    .withMessage("Divisi PIC wajib dipilih.")
    .bail()
    .isInt()
    .withMessage("Divisi PIC harus berupa angka.")
    .bail()
    .custom(async (value) => {
      const category = await knex("monev_pic_divisions")
        .where("id", value)
        .whereNull("deleted_at")
        .first();
      if (!category) {
        throw new Error("Divisi PIC yang Anda pilih tidak ditemukan.");
      }
      return true;
    }),

  body("contractType")
    .trim()
    .notEmpty()
    .withMessage("Tipe kontrak tidak boleh kosong.")
    .bail()
    .isString()
    .withMessage("Tipe kontrak harus berupa teks.")
    .bail()
    .isIn(ALLOWED_CONTRACT_TYPES)
    .withMessage(
      `Tipe kontrak harus salah satu dari: ${ALLOWED_CONTRACT_TYPES.join(
        ", "
      )}.`
    ),

  body("mak")
    .notEmpty()
    .withMessage("MAK tidak boleh kosong.")
    .bail()
    .isString()
    .withMessage("MAK harus berupa teks.")
    .bail()
    .isLength({ max: 50 })
    .withMessage("MAK maksimal 50 karakter."),

  body("name")
    .notEmpty()
    .withMessage("Nama Paket tidak boleh kosong.")
    .bail()
    .isString()
    .withMessage("Nama Paket harus berupa teks.")
    .bail()
    .isLength({ max: 255 })
    .withMessage("Nama Paket maksimal 255 karakter."),

  body("description")
    .notEmpty()
    .withMessage("Deskripsi kategori tidak boleh kosong.")
    .bail()
    .isString()
    .withMessage("Deskripsi kategori harus berupa teks."),

  body("unitOutput")
    .notEmpty()
    .withMessage("Judul kategori tidak boleh kosong.")
    .bail()
    .isString()
    .withMessage("Judul kategori harus berupa teks."),

  body("codeOutput")
    .notEmpty()
    .withMessage("Judul kategori tidak boleh kosong.")
    .bail()
    .isString()
    .withMessage("Judul kategori harus berupa teks."),

  body("volume")
    .notEmpty()
    .withMessage("Judul kategori tidak boleh kosong.")
    .bail()
    .isString()
    .withMessage("Judul kategori harus berupa teks.")
    .bail()
    .isLength({ max: 50 })
    .withMessage("Judul kategori maksimal 50 karakter."),

  body("pagu")
    .notEmpty()
    .withMessage("Jumlah Pagu tidak boleh kosong.")
    .bail()
    .isInt()
    .withMessage("Jumlah Pagu harus berupa angka."),

  body("partner")
    .notEmpty()
    .withMessage("Judul kategori tidak boleh kosong.")
    .bail()
    .isString()
    .withMessage("Judul kategori harus berupa teks.")
    .bail()
    .isLength({ max: 150 })
    .withMessage("Judul kategori maksimal 150 karakter."),

  body("startedMonth")
    .toInt()
    .notEmpty()
    .withMessage("Bulan mulai tidak boleh kosong.")
    .bail()
    .isInt()
    .withMessage("Bulan mulai harus berupa angka.")
    .bail()
    .isIn(ALLOWED_MONTHS)
    .withMessage(
      `Bulan mulai harus salah satu dari: ${ALLOWED_MONTHS.join(", ")}.`
    ),

  body("finishedMonth")
    .toInt()
    .notEmpty()
    .withMessage("Bulan selesai tidak boleh kosong.")
    .bail()
    .isInt()
    .withMessage("Bulan selesai harus berupa angka.")
    .bail()
    .isIn(ALLOWED_MONTHS)
    .withMessage(
      `Bulan selesai harus salah satu dari: ${ALLOWED_MONTHS.join(", ")}.`
    ),

  body("startedYear")
    .toInt()
    .notEmpty()
    .withMessage("Tahun mulai tidak boleh kosong.")
    .bail()
    .isInt({ min: 1900, max: 2100 })
    .withMessage("Tahun mulai tidak valid (1900 s.d 2100)."),

  body("finishedYear")
    .toInt()
    .notEmpty()
    .withMessage("Tahun selesai tidak boleh kosong.")
    .bail()
    .isInt({ min: 1900, max: 2100 })
    .withMessage("Tahun selesai tidak valid (1900 s.d 2100)."),

  // Validasi pasangan (start <= end)
  body(["startedMonth", "startedYear", "finishedMonth", "finishedYear"]).custom(
    (_, { req }) => {
      const sM = Number(req.body.startedMonth);
      const sY = Number(req.body.startedYear);
      const fM = Number(req.body.finishedMonth);
      const fY = Number(req.body.finishedYear);
      if (
        Number.isNaN(sM) ||
        Number.isNaN(sY) ||
        Number.isNaN(fM) ||
        Number.isNaN(fY)
      ) {
        throw new Error("Nilai bulan/tahun tidak valid.");
      }
      if (fY < sY || (fY === sY && fM < sM)) {
        throw new Error(
          "finished (bulan/tahun) tidak boleh lebih kecil dari started (bulan/tahun)."
        );
      }
      return true;
    }
  ),
];
