const { body } = require("express-validator");
const knex = require("../../config/database");

exports.updateEventValidator = [
  body("categoryId")
    .notEmpty()
    .withMessage("Kategori kegiatan wajib dipilih.")
    .bail()
    .isInt()
    .withMessage("Kategori kegiatan harus berupa angka.")
    .bail()
    .custom(async (value) => {
      const category = await knex("cms_events_categories")
        .where("id", value)
        .whereNull("deleted_at")
        .first();
      if (!category) {
        throw new Error("Kategori kegiatan yang Anda pilih tidak ditemukan.");
      }
      return true;
    }),

  body("title")
    .optional({ nullable: true, checkFalsy: true })
    .custom(() => true),

  body("description")
    .optional({ nullable: true, checkFalsy: true })
    .custom(() => true),

  body("eventContent")
    .optional({ nullable: true, checkFalsy: true })
    .custom(() => true),
];
