const { body } = require("express-validator");
const knex = require("../../config/database");
const CMS_ALLOWED_TYPES = Object.freeze([
  "Text",
  "Image",
  "Video",
  "Audio",
  "File",
  "Link",
  "TextArray",
  "ImageArray",
]);

exports.storeContentValidator = [
  body("type")
    .trim()
    .notEmpty()
    .withMessage("Tipe konten tidak boleh kosong.")
    .bail()
    .isString()
    .withMessage("Tipe konten harus berupa teks.")
    .bail()
    .isIn(CMS_ALLOWED_TYPES)
    .withMessage(
      `Tipe konten harus salah satu dari: ${CMS_ALLOWED_TYPES.join(", ")}.`
    ),

  body("content").optional({ nullable: true, checkFalsy: true }),

  body("order")
    .optional({ nullable: true, checkFalsy: true })
    .toInt()
    .isInt({ min: 0 })
    .withMessage("Order harus berupa bilangan bulat bernilai ≥ 0.")
    .bail()
    .custom(async (value) => {
      // kalau tidak dikirim / null / kosong → skip
      if (value == null) return true;
      const dup = await knex("cms_contents")
        .where({ order: value })
        .whereNull("deleted_at")
        .first();
      if (dup) {
        throw new Error(`Order '${value}' sudah digunakan.`);
      }
      return true;
    }),
];
