const express = require("express");
const router = express.Router();
const contentController = require("../../controllers/cms/contentController");
const {
  storeContentValidator,
} = require("../../validators/cms/storeContentValidator");
const {
  updateContentValidator,
} = require("../../validators/cms/updateContentValidator");
const validate = require("../../middlewares/validate");
const authMiddleware = require("../../middlewares/authMiddleware");
const rateLimiter = require("../../middlewares/rateLimitMiddleware");
const requireAbility = require("../../middlewares/requireAbility");
const requirePermission = require("../../middlewares/requirePermission");
const multer = require("multer");
const upload = multer({ limits: { fileSize: 400 * 1024 * 1024 } });

router.use(rateLimiter, authMiddleware, requireAbility("super_admin"));

router.post(
  "/sso/create",
  requirePermission(["create.cms_management"]),
  upload.array("files", 20),
  storeContentValidator,
  validate,
  contentController.store
);

router.patch(
  "/sso/update/:id",
  requirePermission(["edit.cms_management"]),
  upload.array("files", 20),
  updateContentValidator,
  validate,
  contentController.update
);

module.exports = router;
