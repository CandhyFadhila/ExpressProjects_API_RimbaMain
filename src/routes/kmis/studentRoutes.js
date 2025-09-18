const express = require("express");
const router = express.Router();
const studentController = require("../../controllers/kmis/studentController");
const { storeStudentValidator } = require("../../validators/kmis/storeStudentValidator");
const { updateStudentValidator } = require("../../validators/kmis/updateStudentValidator");
const validate = require("../../middlewares/validate");
const authMiddleware = require("../../middlewares/authMiddleware");
const rateLimiter = require("../../middlewares/rateLimitMiddleware");
const requireAbility = require("../../middlewares/requireAbility");
const requirePermission = require("../../middlewares/requirePermission");

router.use(
  rateLimiter,
  authMiddleware,
  requireAbility("super_admin")
);

router.get(
  "/sso/index",
  requirePermission(["view.kmis_student"]),
  studentController.index
);

router.get(
  "/sso/show/:id",
  requirePermission(["view.kmis_student"]),
  studentController.show
);

router.post(
  "/sso/create",
  requirePermission(["create.kmis_student"]),
  storeStudentValidator,
  validate,
  studentController.store
);

router.patch(
  "/sso/update/:id",
  requirePermission(["update.kmis_student"]),
  updateStudentValidator,
  validate,
  studentController.update
);

router.delete(
  "/sso/delete",
  requirePermission(["delete.kmis_student"]),
  studentController.destroy
);

router.patch(
  "/sso/restore",
  requirePermission(["restore.kmis_student"]),
  studentController.restore
);

router.patch(
  "/sso/deactivate",
  requirePermission(["update.kmis_student"]),
  studentController.deactivateAccount
);

router.patch(
  "/sso/activate",
  requirePermission(["update.kmis_student"]),
  studentController.activateAccount
);

module.exports = router;