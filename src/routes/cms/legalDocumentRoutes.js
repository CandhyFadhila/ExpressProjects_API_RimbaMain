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
const requirePermission = require("../../middlewares/requirePermission");
const multer = require("multer");
const upload = multer();

router.use(rateLimiter, authMiddleware);

router.get(
  "/index",
  requirePermission(["view.cms_management"]),
  legalDocumentController.index
);

router.get(
  "/show/:id",
  requirePermission(["view.cms_management"]),
  legalDocumentController.show
);

router.post(
  "/create",
  requirePermission(["create.cms_management"]),
  upload.array("files", 5),
  storeLegalDocumentValidator,
  validate,
  legalDocumentController.store
);

router.patch(
  "/update/:id",
  requirePermission(["edit.cms_management"]),
  upload.array("files", 5),
  updateLegalDocumentValidator,
  validate,
  legalDocumentController.update
);

router.delete(
  "/delete",
  requirePermission(["delete.cms_management"]),
  legalDocumentController.destroy
);

router.patch(
  "/restore",
  requirePermission(["restore.cms_management"]),
  legalDocumentController.restore
);

module.exports = router;
