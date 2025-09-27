const { body } = require("express-validator");

exports.updateAnimalCategoryValidator = [
  body("name")
    .optional({ nullable: true, checkFalsy: true })
    .custom(() => true),

  body("description")
    .optional({ nullable: true, checkFalsy: true })
    .custom(() => true),
];
