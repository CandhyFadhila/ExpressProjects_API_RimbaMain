const express = require("express");
const router = express.Router();
const activityCategoryController = require("../../controllers/masterData/activityCategoryController");
const {
  storeActivityCategoryValidator,
} = require("../../validators/masterData/storeActivityCategoryValidator");
const {
  updateActivityCategoryValidator,
} = require("../../validators/masterData/updateActivityCategoryValidator");
const validate = require("../../middlewares/validate");
const authMiddleware = require("../../middlewares/authMiddleware");
const rateLimiter = require("../../middlewares/rateLimitMiddleware");
const requirePermission = require("../../middlewares/requirePermission");
const multer = require("multer");
const upload = multer();

router.use(rateLimiter, authMiddleware);

router.get(
  "/index",
  requirePermission(["view.master_data"]),
  activityCategoryController.index
);

router.get(
  "/show/:id",
  requirePermission(["view.master_data"]),
  activityCategoryController.show
);

router.post(
  "/create",
  requirePermission(["create.master_data"]),
  upload.none(),
  storeActivityCategoryValidator,
  validate,
  activityCategoryController.store
);

router.patch(
  "/update/:id",
  requirePermission(["edit.master_data"]),
  upload.none(),
  updateActivityCategoryValidator,
  validate,
  activityCategoryController.update
);

router.delete(
  "/delete",
  requirePermission(["delete.master_data"]),
  activityCategoryController.destroy
);

router.patch(
  "/restore",
  requirePermission(["restore.master_data"]),
  activityCategoryController.restore
);

module.exports = router;
