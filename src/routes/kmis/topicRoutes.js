const express = require("express");
const router = express.Router();
const topicController = require("../../controllers/kmis/topicController");
const {
  storeTopicValidator,
} = require("../../validators/kmis/storeTopicValidator");
const {
  updateTopicValidator,
} = require("../../validators/kmis/updateTopicValidator");
const validate = require("../../middlewares/validate");
const authMiddleware = require("../../middlewares/authMiddleware");
const rateLimiter = require("../../middlewares/rateLimitMiddleware");
const requirePermission = require("../../middlewares/requirePermission");
const multer = require("multer");
const upload = multer();

router.use(rateLimiter, authMiddleware);

router.get(
  "/index",
  requirePermission(["view.kmis_topic"]),
  topicController.index
);

router.get(
  "/show/:id",
  requirePermission(["view.kmis_topic"]),
  topicController.show
);

router.post(
  "/create",
  requirePermission(["create.kmis_topic"]),
  upload.array("files", 20),
  storeTopicValidator,
  validate,
  topicController.store
);

router.patch(
  "/update/:id",
  requirePermission(["edit.kmis_topic"]),
  upload.array("files", 20),
  updateTopicValidator,
  validate,
  topicController.update
);

router.delete(
  "/delete",
  requirePermission(["delete.kmis_topic"]),
  topicController.destroy
);

router.patch(
  "/restore",
  requirePermission(["restore.kmis_topic"]),
  topicController.restore
);

module.exports = router;
