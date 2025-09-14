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
const uploadMaterialFields = upload.fields([{ name: "files", maxCount: 1 }]);

router.use(
  rateLimiter,
  authMiddleware,
  requireAbility("super_admin")
);

router.get(
  "/sso/index",
  categoryController.index
);

router.get(
  "/sso/show/:id",
  categoryController.show
);

router.post(
  "/sso/create",
  uploadMaterialFields,
  storeCategoryValidator,
  validate,
  categoryController.store
);

router.patch(
  "/sso/update/:id",
  uploadMaterialFields,
  updateCategoryValidator,
  validate,
  categoryController.update
);

router.delete(
  "/sso/delete",
  categoryController.destroy
);

router.patch(
  "/sso/restore",
  categoryController.restore
);

module.exports = router;