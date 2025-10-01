const { validationResult } = require("express-validator");
const WithoutDataResource = require("../resources/WithoutDataResource");

module.exports = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const message = errors
      .array()
      .map((err) => err.msg)
      .join(" ");
    const response = new WithoutDataResource(
      422,
      "FAILED_VALIDATION",
      "Format Data Tidak Sesuai Ketentuan",
      message
    );
    return res.status(422).json(response.toResponse());
  }
  next();
};
