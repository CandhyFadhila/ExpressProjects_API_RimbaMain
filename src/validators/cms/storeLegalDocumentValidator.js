const { body } = require("express-validator");

exports.storeLegalDocumentValidator = [
  body("title").custom((v) => {
    if (typeof v === "undefined")
      throw new Error("Judul kegiatan tidak boleh kosong.");
    return true;
  }),

  body("description").custom((v) => {
    if (typeof v === "undefined")
      throw new Error("Deskripsi kegiatan tidak boleh kosong.");
    return true;
  })
];
