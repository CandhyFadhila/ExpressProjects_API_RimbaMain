const { body } = require("express-validator");

exports.updateNewsCategoryValidator = [
  body("name")
    .optional({ nullable: true, checkFalsy: true })
    .custom(() => true),

  body("description")
    .optional({ nullable: true, checkFalsy: true })
    .custom(() => true),
];
