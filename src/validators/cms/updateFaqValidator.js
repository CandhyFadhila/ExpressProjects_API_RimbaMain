const { body } = require("express-validator");

exports.updateFaqValidator = [
  body("question")
    .optional({ nullable: true, checkFalsy: true })
    .custom(() => true),

  body("answer")
    .optional({ nullable: true, checkFalsy: true })
    .custom(() => true),
];
