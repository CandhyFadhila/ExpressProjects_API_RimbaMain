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
const requirePermission = require("../../middlewares/requirePermission");
const multer = require("multer");
const upload = multer();

router.use(rateLimiter, authMiddleware);

router.get(
  "/index",
  requirePermission(["view.cms_management"]),
  newsController.index
);

router.get(
  "/show/:id",
  requirePermission(["view.cms_management"]),
  newsController.show
);

router.post(
  "/create",
  requirePermission(["create.cms_management"]),
  upload.array("files", 20),
  storeNewsValidator,
  validate,
  newsController.store
);

router.patch(
  "/update/:id",
  requirePermission(["edit.cms_management"]),
  upload.array("files", 20),
  updateNewsValidator,
  validate,
  newsController.update
);

router.delete(
  "/delete",
  requirePermission(["delete.cms_management"]),
  newsController.destroy
);

router.patch(
  "/restore",
  requirePermission(["restore.cms_management"]),
  newsController.restore
);

module.exports = router;
