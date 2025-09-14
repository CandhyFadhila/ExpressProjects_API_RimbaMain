const express = require("express");
const router = express.Router();
const studentController = require("../../controllers/kmis/studentController");
const { storeStudentValidator } = require("../../validators/kmis/storeStudentValidator");
const { updateStudentValidator } = require("../../validators/kmis/updateStudentValidator");
const validate = require("../../middlewares/validate");
const authMiddleware = require("../../middlewares/authMiddleware");
const rateLimiter = require("../../middlewares/rateLimitMiddleware");
const requireAbility = require("../../middlewares/requireAbility");

router.use(
  rateLimiter,
  authMiddleware,
  requireAbility("super_admin")
);

router.get(
  "/sso/index",
  studentController.index
);

router.get(
  "/sso/show/:id",
  studentController.show
);

router.post(
  "/sso/create",
  storeStudentValidator,
  validate,
  studentController.store
);

router.patch(
  "/sso/update/:id",
  updateStudentValidator,
  validate,
  studentController.update
);

router.delete(
  "/sso/delete",
  studentController.destroy
);

router.patch(
  "/sso/restore",
  studentController.restore
);

router.patch(
  "/sso/deactivate",
  studentController.deactivateAccount
);

router.patch(
  "/sso/activate",
  studentController.activateAccount
);

module.exports = router;