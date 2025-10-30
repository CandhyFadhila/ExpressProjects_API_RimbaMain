const { body } = require("express-validator");
const ALLOWED_VALIDATION_STATUSES = Object.freeze([2, 3]);

exports.updateMonthlyRealizationVerificationValidator = [
  body("validationStatus")
    .exists({ checkNull: true, checkFalsy: true })
    .withMessage("Status validasi tidak boleh kosong.")
    .bail()
    .toInt()
    .isInt()
    .withMessage("Status validasi harus bilangan bulat.")
    .bail()
    .isIn(ALLOWED_VALIDATION_STATUSES)
    .withMessage("Status validasi harus 2 (Approve) atau 3 (Rejected)."),

  body("rejectionReason")
    .optional({ nullable: true })
    .isString()
    .withMessage("Alasan penolakan harus berupa teks.")
    .bail()
    .trim(),

  // Jika status = 3 (Rejected), rejectionReason wajib diisi
  body("rejectionReason").custom((value, { req }) => {
    const status = Number(req.body.validationStatus);
    if (status === 3) {
      if (
        value === undefined ||
        value === null ||
        String(value).trim() === ""
      ) {
        throw new Error(
          "Alasan penolakan wajib diisi saat status = 3 (Rejected)."
        );
      }
    }
    return true;
  }),

  // Sanitizer: jika status = 2 (Approve), rejectionReason -> null
  body("rejectionReason").customSanitizer((value, { req }) => {
    const status = Number(req.body.validationStatus);
    if (status === 2) return null;
    return typeof value === "string" ? value.trim() : value ?? null;
  }),
];
