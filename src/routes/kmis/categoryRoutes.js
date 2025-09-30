const express = require("express");
const router = express.Router();
const categoryController = require("../../controllers/kmis/categoryController");
const {
  storeCategoryValidator,
} = require("../../validators/kmis/storeCategoryValidator");
const {
  updateCategoryValidator,
} = require("../../validators/kmis/updateCategoryValidator");
const validate = require("../../middlewares/validate");
const authMiddleware = require("../../middlewares/authMiddleware");
const rateLimiter = require("../../middlewares/rateLimitMiddleware");
const requirePermission = require("../../middlewares/requirePermission");
const multer = require("multer");
const upload = multer();

router.use(rateLimiter, authMiddleware);

router.get(
  "/index",
  requirePermission(["view.kmis_category"]),
  categoryController.index
);

router.get(
  "/show/:id",
  requirePermission(["view.kmis_category"]),
  categoryController.show
);

router.post(
  "/create",
  requirePermission(["create.kmis_category"]),
  upload.array("files", 20),
  storeCategoryValidator,
  validate,
  categoryController.store
);

router.patch(
  "/update/:id",
  requirePermission(["edit.kmis_category"]),
  upload.array("files", 20),
  updateCategoryValidator,
  validate,
  categoryController.update
);

router.delete(
  "/delete",
  requirePermission(["delete.kmis_category"]),
  categoryController.destroy
);

router.patch(
  "/restore",
  requirePermission(["restore.kmis_category"]),
  categoryController.restore
);

module.exports = router;
