const express = require("express");
const router = express.Router();
const shareReportController = require("../../controllers/monev/shareReportController");
const {
  storeShareReportValidator,
} = require("../../validators/monev/storeShareReportValidator");
const {
  updateShareReportValidator,
} = require("../../validators/monev/updateShareReportValidator");
const validate = require("../../middlewares/validate");
const authMiddleware = require("../../middlewares/authMiddleware");
const rateLimiter = require("../../middlewares/rateLimitMiddleware");
const requirePermission = require("../../middlewares/requirePermission");
const multer = require("multer");
const upload = multer();

router.use(rateLimiter, authMiddleware);

router.get(
  "/index",
  requirePermission(["view.monev_share_report"]),
  shareReportController.index
);

router.get(
  "/show/:id",
  requirePermission(["view.monev_share_report"]),
  shareReportController.show
);

router.post(
  "/create",
  requirePermission(["create.monev_share_report"]),
  upload.array("files", 20),
  storeShareReportValidator,
  validate,
  shareReportController.store
);

router.patch(
  "/update/:id",
  requirePermission(["edit.monev_share_report"]),
  upload.array("files", 20),
  updateShareReportValidator,
  validate,
  shareReportController.update
);

router.delete(
  "/delete",
  requirePermission(["delete.monev_share_report"]),
  shareReportController.destroy
);

module.exports = router;
