const { body } = require("express-validator");
const knex = require("../../config/database");

exports.storeAnimalCompositionValidator = [
  body("categoryId")
    .notEmpty()
    .withMessage("Kategori komposisi satwa wajib dipilih.")
    .bail()
    .isInt()
    .withMessage("Kategori komposisi satwa harus berupa angka.")
    .bail()
    .custom(async (value) => {
      const category = await knex("cms_animal_categories")
        .where("id", value)
        .whereNull("deleted_at")
        .first();
      if (!category) {
        throw new Error(
          "Kategori komposisi satwa yang Anda pilih tidak ditemukan."
        );
      }
      return true;
    }),

  body("name").custom((v) => {
    if (typeof v === "undefined")
      throw new Error("Nama komposisi satwa tidak boleh kosong.");
    return true;
  }),

  body("description").custom((v) => {
    if (typeof v === "undefined")
      throw new Error("Deskripsi komposisi satwa tidak boleh kosong.");
    return true;
  }),

  body("total")
    .notEmpty()
    .withMessage("Total komposisi satwa tidak boleh kosong.")
    .bail()
    .isInt({ min: 0 })
    .withMessage(
      "Total komposisi satwa harus berupa bilangan bulat lebih besar atau sama dengan 0."
    )
    .toInt(),
];
