const express = require("express");
const router = express.Router();
const legalDocumentController = require("../../controllers/cms/legalDocumentController");
const {
  storeLegalDocumentValidator,
} = require("../../validators/cms/storeLegalDocumentValidator");
const {
  updateLegalDocumentValidator,
} = require("../../validators/cms/updateLegalDocumentValidator");
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
  legalDocumentController.index
);

router.get(
  "/sso/show/:id",
  requirePermission(["view.cms_management"]),
  legalDocumentController.show
);

router.post(
  "/sso/create",
  requirePermission(["create.cms_management"]),
  upload.array("files", 5),
  storeLegalDocumentValidator,
  validate,
  legalDocumentController.store
);

router.patch(
  "/sso/update/:id",
  requirePermission(["edit.cms_management"]),
  upload.array("files", 5),
  updateLegalDocumentValidator,
  validate,
  legalDocumentController.update
);

router.delete(
  "/sso/delete",
  requirePermission(["delete.cms_management"]),
  legalDocumentController.destroy
);

router.patch(
  "/sso/restore",
  requirePermission(["restore.cms_management"]),
  legalDocumentController.restore
);

module.exports = router;
