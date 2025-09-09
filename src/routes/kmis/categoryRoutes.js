const express = require("express");
const router = express.Router();
const categoryController = require("../../controllers/kmis/categoryController");
const { storeCategoryValidator } = require("../../validators/kmis/storeCategoryValidator");
const { updateCategoryValidator } = require("../../validators/kmis/updateCategoryValidator");
const validate = require("../../middlewares/validate");
const authMiddleware = require("../../middlewares/authMiddleware");
const rateLimiter = require("../../middlewares/rateLimitMiddleware");
const requireAbility = require("../../middlewares/requireAbility");
const multer = require("multer");
const upload = multer();

router.get(
  "/sso/index",
  rateLimiter,
  authMiddleware,
  requireAbility("super_admin"),
  categoryController.index
);

router.get(
  "/sso/show/:id",
  rateLimiter,
  authMiddleware,
  requireAbility("super_admin"),
  categoryController.show
);

router.post(
  "/sso/create",
  rateLimiter,
  authMiddleware,
  upload.array("files", 1),
  storeCategoryValidator,
  validate,
  requireAbility("super_admin"),
  categoryController.store
);

router.patch(
  "/sso/update/:id",
  rateLimiter,
  authMiddleware,
  upload.array("files", 1),
  updateCategoryValidator,
  validate,
  requireAbility("super_admin"),
  categoryController.update
);

router.delete(
  "/sso/delete",
  rateLimiter,
  authMiddleware,
  requireAbility("super_admin"),
  categoryController.destroy
);

router.patch(
  "/sso/restore",
  rateLimiter,
  authMiddleware,
  requireAbility("super_admin"),
  categoryController.restore
);

module.exports = router;