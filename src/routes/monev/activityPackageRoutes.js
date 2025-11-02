const express = require("express");
const router = express.Router();
const activityPackageController = require("../../controllers/monev/activityPackageController");
const {
  storeActivityPackageValidator,
} = require("../../validators/monev/storeActivityPackageValidator");
const {
  updateActivityPackageValidator,
} = require("../../validators/monev/updateActivityPackageValidator");
const validate = require("../../middlewares/validate");
const authMiddleware = require("../../middlewares/authMiddleware");
const rateLimiter = require("../../middlewares/rateLimitMiddleware");
const requirePermission = require("../../middlewares/requirePermission");
const multer = require("multer");
const upload = multer();

router.use(rateLimiter, authMiddleware);

router.get(
  "/index",
  requirePermission(["view.monev_activity"]),
  activityPackageController.index
);

router.get(
  "/show/:id",
  requirePermission(["view.monev_activity"]),
  activityPackageController.show
);

router.post(
  "/create",
  requirePermission(["create.monev_activity"]),
  upload.none(),
  storeActivityPackageValidator,
  validate,
  activityPackageController.store
);

router.patch(
  "/update/:id",
  requirePermission(["edit.monev_activity"]),
  upload.none(),
  updateActivityPackageValidator,
  validate,
  activityPackageController.update
);

router.delete(
  "/delete",
  requirePermission(["delete.monev_activity"]),
  activityPackageController.destroy
);

router.get(
  "/export",
  requirePermission(["view.monev_activity"]),
  activityPackageController.export
);

module.exports = router;
