const express = require("express");
const router = express.Router();
const educatorController = require("../../controllers/kmis/educatorController");
const {
  storeEducatorValidator,
} = require("../../validators/kmis/storeEducatorValidator");
const {
  updateEducatorValidator,
} = require("../../validators/kmis/updateEducatorValidator");
const validate = require("../../middlewares/validate");
const authMiddleware = require("../../middlewares/authMiddleware");
const rateLimiter = require("../../middlewares/rateLimitMiddleware");
const requirePermission = require("../../middlewares/requirePermission");
const multer = require("multer");
const upload = multer();

router.use(rateLimiter, authMiddleware);

router.get(
  "/index",
  requirePermission(["view.kmis_educator"]),
  educatorController.index
);

router.get(
  "/show/:id",
  requirePermission(["view.kmis_educator"]),
  educatorController.show
);

router.post(
  "/create",
  requirePermission(["create.kmis_educator"]),
  upload.none(),
  storeEducatorValidator,
  validate,
  educatorController.store
);

router.patch(
  "/update/:id",
  requirePermission(["edit.kmis_educator"]),
  upload.none(),
  updateEducatorValidator,
  validate,
  educatorController.update
);

router.delete(
  "/delete",
  requirePermission(["delete.kmis_educator"]),
  educatorController.destroy
);

router.patch(
  "/restore",
  requirePermission(["restore.kmis_educator"]),
  educatorController.restore
);

router.patch(
  "/deactivate",
  requirePermission(["edit.kmis_educator"]),
  educatorController.deactivateAccount
);

router.patch(
  "/activate",
  requirePermission(["edit.kmis_educator"]),
  educatorController.activateAccount
);

module.exports = router;
