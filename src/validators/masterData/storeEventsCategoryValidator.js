const { body } = require("express-validator");

exports.storeEventsCategoryValidator = [
  body("name").custom((v) => {
    if (typeof v === "undefined")
      throw new Error("Nama kategori kegiatan wajib diisi.");
    return true;
  }),

  body("description").custom((v) => {
    if (typeof v === "undefined")
      throw new Error("Deskripsi kategori kegiatan wajib diisi.");
    return true;
  }),
];
