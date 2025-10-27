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
  "/index",
  requirePermission(["view.master_data"]),
  monevDashboardController.index
);

router.get(
  "/:id",
  requirePermission(["view.master_data"]),
  monevDashboardController.getDahsboard
);

router.post(
  "/create",
  requirePermission(["create.master_data"]),
  uploadMaterialFields,
  storeMonevDashboardValidator,
  validate,
  monevDashboardController.store
);

router.patch(
  "/update/:id",
  requirePermission(["edit.master_data"]),
  uploadMaterialFields,
  updateMonevDashboardValidator,
  validate,
  monevDashboardController.update
);

module.exports = router;
