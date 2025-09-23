const express = require("express");
const router = express.Router();
const newsController = require("../../controllers/cms/newsController");
const {
  storeNewsValidator,
} = require("../../validators/cms/storeNewsValidator");
const {
  updateNewsValidator,
} = require("../../validators/cms/updateNewsValidator");
const validate = require("../../middlewares/validate");
const authMiddleware = require("../../middlewares/authMiddleware");
const rateLimiter = require("../../middlewares/rateLimitMiddleware");
const requireAbility = require("../../middlewares/requireAbility");
const requirePermission = require("../../middlewares/requirePermission");
const multer = require("multer");
const upload = multer();

router.use(rateLimiter, authMiddleware, requireAbility("super_admin"));

router.get(
  "/sso/index",
  requirePermission(["view.cms_management"]),
  newsController.index
);

router.get(
  "/sso/show/:id",
  requirePermission(["view.cms_management"]),
  newsController.show
);

router.post(
  "/sso/create",
  requirePermission(["create.cms_management"]),
  upload.array("files", 1),
  storeNewsValidator,
  validate,
  newsController.store
);

router.patch(
  "/sso/update/:id",
  requirePermission(["edit.cms_management"]),
  upload.array("files", 1),
  updateNewsValidator,
  validate,
  newsController.update
);

router.delete(
  "/sso/delete",
  requirePermission(["delete.cms_management"]),
  newsController.destroy
);

router.patch(
  "/sso/restore",
  requirePermission(["restore.cms_management"]),
  newsController.restore
);

module.exports = router;
