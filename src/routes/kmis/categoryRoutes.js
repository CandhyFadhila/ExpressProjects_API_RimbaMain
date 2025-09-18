const express = require("express");
const router = express.Router();
const categoryController = require("../../controllers/kmis/categoryController");
const { storeCategoryValidator } = require("../../validators/kmis/storeCategoryValidator");
const { updateCategoryValidator } = require("../../validators/kmis/updateCategoryValidator");
const validate = require("../../middlewares/validate");
const authMiddleware = require("../../middlewares/authMiddleware");
const rateLimiter = require("../../middlewares/rateLimitMiddleware");
const requireAbility = require("../../middlewares/requireAbility");
const requirePermission = require("../../middlewares/requirePermission");
const multer = require("multer");
const upload = multer();

router.use(
  rateLimiter,
  authMiddleware,
  requireAbility("super_admin")
);

router.get(
  "/sso/index",
  requirePermission(["view.kmis_category"]),
  categoryController.index
);

router.get(
  "/sso/show/:id",
  requirePermission(["view.kmis_category"]),
  categoryController.show
);

router.post(
  "/sso/create",
  requirePermission(["create.kmis_category"]),
  upload.array("files", 1),
  storeCategoryValidator,
  validate,
  categoryController.store
);

router.patch(
  "/sso/update/:id",
  requirePermission(["update.kmis_category"]),
  upload.array("files", 1),
  updateCategoryValidator,
  validate,
  categoryController.update
);

router.delete(
  "/sso/delete",
  requirePermission(["delete.kmis_category"]),
  categoryController.destroy
);

router.patch(
  "/sso/restore",
  requirePermission(["restore.kmis_category"]),
  categoryController.restore
);

module.exports = router;