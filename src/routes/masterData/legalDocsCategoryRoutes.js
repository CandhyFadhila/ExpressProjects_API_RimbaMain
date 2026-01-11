const express = require("express");
const router = express.Router();
const legalDocsCategoryController = require("../../controllers/masterData/legalDocsCategoryController");
const {
  storeLegalDocsCategoryValidator,
} = require("../../validators/masterData/storeLegalDocsCategoryValidator");
const {
  updateLegalDocsCategoryValidator,
} = require("../../validators/masterData/updateLegalDocsCategoryValidator");
const validate = require("../../middlewares/validate");
const authMiddleware = require("../../middlewares/authMiddleware");
const rateLimiter = require("../../middlewares/rateLimitMiddleware");
const requirePermission = require("../../middlewares/requirePermission");
const multer = require("multer");
const upload = multer();

router.use(rateLimiter, authMiddleware);

router.get(
  "/index",
  requirePermission(["view.master_data"]),
  legalDocsCategoryController.index
);

router.get(
  "/show/:id",
  requirePermission(["view.master_data"]),
  legalDocsCategoryController.show
);

router.post(
  "/create",
  requirePermission(["create.master_data"]),
  upload.none(),
  storeLegalDocsCategoryValidator,
  validate,
  legalDocsCategoryController.store
);

router.patch(
  "/update/:id",
  requirePermission(["edit.master_data"]),
  upload.none(),
  updateLegalDocsCategoryValidator,
  validate,
  legalDocsCategoryController.update
);

router.delete(
  "/delete",
  requirePermission(["delete.master_data"]),
  legalDocsCategoryController.destroy
);

router.patch(
  "/restore",
  requirePermission(["restore.master_data"]),
  legalDocsCategoryController.restore
);

module.exports = router;
