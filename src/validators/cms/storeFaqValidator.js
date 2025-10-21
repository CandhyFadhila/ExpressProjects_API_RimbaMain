const { body } = require("express-validator");

exports.storeFaqValidator = [
  body("question").custom((v) => {
    if (typeof v === "undefined")
      throw new Error("Pernyataan wajib diisi.");
    return true;
  }),

  body("answer").custom((v) => {
    if (typeof v === "undefined")
      throw new Error("Deskripsi jawaban wajib diisi.");
    return true;
  }),
];
