const express = require("express");
const router = express.Router();
const monthlyRealizationController = require("../../controllers/monev/monthlyRealizationController");
const {
  updateMonthlyRealizationValidator,
} = require("../../validators/monev/updateMonthlyRealizationValidator");
const {
  updateMonthlyRealizationVerificationValidator,
} = require("../../validators/monev/updateMonthlyRealizationVerificationValidator");
const validate = require("../../middlewares/validate");
const authMiddleware = require("../../middlewares/authMiddleware");
const rateLimiter = require("../../middlewares/rateLimitMiddleware");
const requirePermission = require("../../middlewares/requirePermission");
const multer = require("multer");
const upload = multer();

router.use(rateLimiter, authMiddleware);

router.get(
  "/:id",
  requirePermission(["view.monev_monthly_realization"]),
  monthlyRealizationController.getMonthlyRealizationbyActivityPackageId
);

router.patch(
  "/update/:id",
  requirePermission(["edit.monev_monthly_realization"]),
  upload.array("files", 20),
  updateMonthlyRealizationValidator,
  validate,
  monthlyRealizationController.update
);

router.patch(
  "/verification/:id",
  requirePermission(["edit.monev_monthly_realization"]),
  upload.none(),
  updateMonthlyRealizationVerificationValidator,
  validate,
  monthlyRealizationController.verification
);

module.exports = router;
