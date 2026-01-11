const { body } = require("express-validator");

exports.updateLegalDocsCategoryValidator = [
  body("name")
    .optional({ nullable: true, checkFalsy: true })
    .custom(() => true),

  body("description")
    .optional({ nullable: true, checkFalsy: true })
    .custom(() => true),
];
