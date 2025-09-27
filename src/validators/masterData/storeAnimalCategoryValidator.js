const { body } = require("express-validator");

exports.storeAnimalCategoryValidator = [
  body("name").custom((v) => {
    if (typeof v === "undefined")
      throw new Error("Nama kategori satwa wajib diisi.");
    return true;
  }),

  body("description").custom((v) => {
    if (typeof v === "undefined")
      throw new Error("Deskripsi kategori satwa wajib diisi.");
    return true;
  }),
];
