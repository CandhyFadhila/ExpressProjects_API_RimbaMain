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

exports.updateContentValidator = [
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
    .custom(async (value, { req }) => {
      if (value == null) return true;
      const id = Number(req.params.id);
      const dup = await knex("cms_contents")
        .where({ order: value })
        .whereNull("deleted_at")
        .whereNot("id", id)
        .first();
      if (dup) {
        throw new Error(`Order '${value}' sudah digunakan oleh konten lain.`);
      }
      return true;
    }),
];
