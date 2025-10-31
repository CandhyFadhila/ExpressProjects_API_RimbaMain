const express = require("express");
const router = express.Router();
const monevDashboardController = require("../../controllers/masterData/monevDashboardController");
const {
  storeMonevDashboardValidator,
} = require("../../validators/masterData/storeMonevDashboardValidator");
const {
  updateMonevDashboardValidator,
} = require("../../validators/masterData/updateMonevDashboardValidator");
const validate = require("../../middlewares/validate");
const authMiddleware = require("../../middlewares/authMiddleware");
const rateLimiter = require("../../middlewares/rateLimitMiddleware");
const requirePermission = require("../../middlewares/requirePermission");
const multer = require("multer");
const upload = multer();
const uploadMaterialFields = upload.fields([
  { name: "frameworkFiles", maxCount: 1 },
  { name: "planFiles", maxCount: 1 },
]);

router.use(rateLimiter, authMiddleware);

router.get(
  "/info",
  requirePermission(["view.monev_dashboard"]),
  monevDashboardController.dashboardInfo
);

router.get(
  "/:id",
  requirePermission(["view.monev_dashboard"]),
  monevDashboardController.getDashboard
);

router.post(
  "/create",
  requirePermission(["create.monev_dashboard"]),
  uploadMaterialFields,
  storeMonevDashboardValidator,
  validate,
  monevDashboardController.store
);

router.patch(
  "/update/:id",
  requirePermission(["edit.monev_dashboard"]),
  uploadMaterialFields,
  updateMonevDashboardValidator,
  validate,
  monevDashboardController.update
);

module.exports = router;
