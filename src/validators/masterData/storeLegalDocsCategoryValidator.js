const { body } = require("express-validator");

exports.storeLegalDocsCategoryValidator = [
  body("name").custom((v) => {
    if (typeof v === "undefined")
      throw new Error("Nama kategori berita wajib diisi.");
    return true;
  }),

  body("description").custom((v) => {
    if (typeof v === "undefined")
      throw new Error("Deskripsi kategori berita wajib diisi.");
    return true;
  }),
];
