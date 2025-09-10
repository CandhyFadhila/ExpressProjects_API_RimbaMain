const { body } = require("express-validator");
const knex = require("../../config/database");

exports.updateStudentValidator = [
  body("name")
    .notEmpty()
    .withMessage("Nama peserta tidak boleh kosong.")
    .bail()
    .isString()
    .withMessage("Nama peserta harus berupa teks.")
    .bail()
    .isLength({ max: 255 })
    .withMessage("Nama peserta maksimal 255 karakter."),

  body("email")
    .notEmpty()
    .withMessage("Email peserta tidak boleh kosong.")
    .bail()
    .isEmail()
    .withMessage(
      "Silahkan masukkan email yang valid, bisa berupa @gmail atau yang lain."
    )
    .bail()
    .isString()
    .withMessage("Email peserta harus berupa teks."),

  body("accountStatus")
    .exists()
    .withMessage("Field 'accountStatus' wajib diisi.")
    .bail()
    .isBoolean()
    .withMessage("Field 'accountStatus' harus boolean (true/false).")
    .bail()
    .toBoolean()
    .custom(async (value, { req }) => {
      const id = req.params.id;
      const user = await knex("users")
        .where("id", id)
        .where("role_id", 3)
        .whereNull("deleted_at")
        .first();
      if (!user) {
        throw new Error(`Data peserta dengan ID '${id}' tidak ditemukan.`);
      }
      if (value === true) {
        if (user.account_status === 1) {
          throw new Error("Akun ini belum dilakukan reset password oleh peserta.");
        }
      } else {
        if (user.account_status === 3) {
          throw new Error("Akun ini sudah dalam status dinonaktifkan.");
        }
      }
      return true;
    }),
];
