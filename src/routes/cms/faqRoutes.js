const express = require("express");
const router = express.Router();
const faqController = require("../../controllers/cms/faqController");
const {
  storeFaqValidator,
} = require("../../validators/cms/storeFaqValidator");
const {
  updateFaqValidator,
} = require("../../validators/cms/updateFaqValidator");
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
  faqController.index
);

router.get(
  "/show/:id",
  requirePermission(["view.cms_management"]),
  faqController.show
);

router.post(
  "/create",
  requirePermission(["create.cms_management"]),
  upload.none(),
  storeFaqValidator,
  validate,
  faqController.store
);

router.patch(
  "/update/:id",
  requirePermission(["edit.cms_management"]),
  upload.none(),
  updateFaqValidator,
  validate,
  faqController.update
);

router.delete(
  "/delete",
  requirePermission(["delete.cms_management"]),
  faqController.destroy
);

router.patch(
  "/restore",
  requirePermission(["restore.cms_management"]),
  faqController.restore
);

module.exports = router;
