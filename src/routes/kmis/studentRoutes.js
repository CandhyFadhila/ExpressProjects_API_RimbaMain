const express = require("express");
const router = express.Router();
const studentController = require("../../controllers/kmis/studentController");
const { storeStudentValidator } = require("../../validators/kmis/storeStudentValidator");
const { updateStudentValidator } = require("../../validators/kmis/updateStudentValidator");
const validate = require("../../middlewares/validate");
const authMiddleware = require("../../middlewares/authMiddleware");
const rateLimiter = require("../../middlewares/rateLimitMiddleware");
const requireAbility = require("../../middlewares/requireAbility");

router.get(
  "/sso/index",
  rateLimiter,
  authMiddleware,
  requireAbility("super_admin"),
  studentController.index
);

router.get(
  "/sso/show/:id",
  rateLimiter,
  authMiddleware,
  requireAbility("super_admin"),
  studentController.show
);

router.post(
  "/sso/create",
  rateLimiter,
  authMiddleware,
  storeStudentValidator,
  validate,
  requireAbility("super_admin"),
  studentController.store
);

router.patch(
  "/sso/update/:id",
  rateLimiter,
  authMiddleware,
  updateStudentValidator,
  validate,
  requireAbility("super_admin"),
  studentController.update
);

router.delete(
  "/sso/delete",
  rateLimiter,
  authMiddleware,
  requireAbility("super_admin"),
  studentController.destroy
);

router.patch(
  "/sso/restore",
  rateLimiter,
  authMiddleware,
  requireAbility("super_admin"),
  studentController.restore
);

router.patch(
  "/sso/deactivate",
  rateLimiter,
  authMiddleware,
  requireAbility("super_admin"),
  studentController.deactivateAccount
);

router.patch(
  "/sso/activate",
  rateLimiter,
  authMiddleware,
  requireAbility("super_admin"),
  studentController.activateAccount
);

module.exports = router;