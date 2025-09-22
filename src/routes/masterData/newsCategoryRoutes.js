const express = require("express");
const router = express.Router();
const newsCategoryController = require("../../controllers/masterData/newsCategoryController");
const {
  storeNewsCategoryValidator,
} = require("../../validators/masterData/storeNewsCategoryValidator");
const {
  updateNewsCategoryValidator,
} = require("../../validators/masterData/updateNewsCategoryValidator");
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
  newsCategoryController.index
);

router.get(
  "/show/:id",
  requirePermission(["view.master_data"]),
  newsCategoryController.show
);

router.post(
  "/create",
  requirePermission(["create.master_data"]),
  upload.none(),
  storeNewsCategoryValidator,
  validate,
  newsCategoryController.store
);

router.patch(
  "/update/:id",
  requirePermission(["edit.master_data"]),
  upload.none(),
  updateNewsCategoryValidator,
  validate,
  newsCategoryController.update
);

router.delete(
  "/delete",
  requirePermission(["delete.master_data"]),
  newsCategoryController.destroy
);

router.patch(
  "/restore",
  requirePermission(["restore.master_data"]),
  newsCategoryController.restore
);

module.exports = router;
