const express = require("express");
const router = express.Router();
const targetController = require("../../controllers/monev/targetController");
const {
  updateTargetValidator,
} = require("../../validators/monev/updateTargetValidator");
const {
  updateTargetVerificationValidator,
} = require("../../validators/monev/updateTargetVerificationValidator");
const validate = require("../../middlewares/validate");
const authMiddleware = require("../../middlewares/authMiddleware");
const rateLimiter = require("../../middlewares/rateLimitMiddleware");
const requirePermission = require("../../middlewares/requirePermission");
const multer = require("multer");
const upload = multer();

router.use(rateLimiter, authMiddleware);

router.get(
  "/:id",
  requirePermission(["view.monev_target"]),
  targetController.getTargetbyActivityPackageId
);

router.patch(
  "/update/:id",
  requirePermission(["edit.monev_target"]),
  upload.none(),
  updateTargetValidator,
  validate,
  targetController.update
);

router.patch(
  "/verification/:id",
  requirePermission(["edit.monev_target"]),
  upload.none(),
  updateTargetVerificationValidator,
  validate,
  targetController.verification
);

module.exports = router;
