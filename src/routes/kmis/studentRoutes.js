const express = require("express");
const router = express.Router();
const studentController = require("../../controllers/kmis/studentController");
const {
  storeStudentValidator,
} = require("../../validators/kmis/storeStudentValidator");
const {
  updateStudentValidator,
} = require("../../validators/kmis/updateStudentValidator");
const validate = require("../../middlewares/validate");
const authMiddleware = require("../../middlewares/authMiddleware");
const rateLimiter = require("../../middlewares/rateLimitMiddleware");
const requirePermission = require("../../middlewares/requirePermission");

router.use(rateLimiter, authMiddleware);

router.get(
  "/index",
  requirePermission(["view.kmis_student"]),
  studentController.index
);

router.get(
  "/show/:id",
  requirePermission(["view.kmis_student"]),
  studentController.show
);

router.post(
  "/create",
  requirePermission(["create.kmis_student"]),
  storeStudentValidator,
  validate,
  studentController.store
);

router.patch(
  "/update/:id",
  requirePermission(["edit.kmis_student"]),
  updateStudentValidator,
  validate,
  studentController.update
);

router.delete(
  "/delete",
  requirePermission(["delete.kmis_student"]),
  studentController.destroy
);

router.patch(
  "/restore",
  requirePermission(["restore.kmis_student"]),
  studentController.restore
);

router.patch(
  "/deactivate",
  requirePermission(["edit.kmis_student"]),
  studentController.deactivateAccount
);

router.patch(
  "/activate",
  requirePermission(["edit.kmis_student"]),
  studentController.activateAccount
);

module.exports = router;
