const express = require("express");
const router = express.Router();
const eventController = require("../../controllers/cms/eventController");
const {
  storeEventValidator,
} = require("../../validators/cms/storeEventValidator");
const {
  updateEventValidator,
} = require("../../validators/cms/updateEventValidator");
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
  eventController.index
);

router.get(
  "/show/:id",
  requirePermission(["view.cms_management"]),
  eventController.show
);

router.post(
  "/create",
  requirePermission(["create.cms_management"]),
  upload.array("files", 20),
  storeEventValidator,
  validate,
  eventController.store
);

router.patch(
  "/update/:id",
  requirePermission(["edit.cms_management"]),
  upload.array("files", 20),
  updateEventValidator,
  validate,
  eventController.update
);

router.delete(
  "/delete",
  requirePermission(["delete.cms_management"]),
  eventController.destroy
);

router.patch(
  "/restore",
  requirePermission(["restore.cms_management"]),
  eventController.restore
);

module.exports = router;
