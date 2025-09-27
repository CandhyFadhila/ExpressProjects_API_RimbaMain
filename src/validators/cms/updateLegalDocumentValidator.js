const { body } = require("express-validator");

exports.updateLegalDocumentValidator = [
  body("title")
    .optional({ nullable: true, checkFalsy: true })
    .custom(() => true),

  body("description")
    .optional({ nullable: true, checkFalsy: true })
    .custom(() => true),
];
