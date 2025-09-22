const express = require("express");
const router = express.Router();
const eventCategoryController = require("../../controllers/masterData/eventCategoryController");
const {
  storeEventsCategoryValidator,
} = require("../../validators/masterData/storeEventsCategoryValidator");
const {
  updateEventsCategoryValidator,
} = require("../../validators/masterData/updateEventsCategoryValidator");
const validate = require("../../middlewares/validate");
const authMiddleware = require("../../middlewares/authMiddleware");
const rateLimiter = require("../../middlewares/rateLimitMiddleware");
const requireAbility = require("../../middlewares/requireAbility");
const requirePermission = require("../../middlewares/requirePermission");
const multer = require("multer");
const upload = multer();

router.use(rateLimiter, authMiddleware, requireAbility("super_admin"));

router.get(
  "/index",
  requirePermission(["view.master_data"]),
  eventCategoryController.index
);

router.get(
  "/show/:id",
  requirePermission(["view.master_data"]),
  eventCategoryController.show
);

router.post(
  "/create",
  requirePermission(["create.master_data"]),
  upload.none(),
  storeEventsCategoryValidator,
  validate,
  eventCategoryController.store
);

router.patch(
  "/update/:id",
  requirePermission(["edit.master_data"]),
  upload.none(),
  updateEventsCategoryValidator,
  validate,
  eventCategoryController.update
);

router.delete(
  "/delete",
  requirePermission(["delete.master_data"]),
  eventCategoryController.destroy
);

router.patch(
  "/restore",
  requirePermission(["restore.master_data"]),
  eventCategoryController.restore
);

module.exports = router;
