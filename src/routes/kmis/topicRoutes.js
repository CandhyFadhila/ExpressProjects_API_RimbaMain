const express = require("express");
const router = express.Router();
const topicController = require("../../controllers/kmis/topicController");
const { storeTopicValidator } = require("../../validators/kmis/storeTopicValidator");
const { updateTopicValidator } = require("../../validators/kmis/updateTopicValidator");
const validate = require("../../middlewares/validate");
const authMiddleware = require("../../middlewares/authMiddleware");
const rateLimiter = require("../../middlewares/rateLimitMiddleware");
const requireAbility = require("../../middlewares/requireAbility");
const multer = require("multer");
const upload = multer();

router.get(
  "/sso/index",
  rateLimiter,
  authMiddleware,
  requireAbility("super_admin"),
  topicController.index
);

router.get(
  "/sso/show/:id",
  rateLimiter,
  authMiddleware,
  requireAbility("super_admin"),
  topicController.show
);

router.post(
  "/sso/create",
  rateLimiter,
  authMiddleware,
  upload.array("files", 1),
  storeTopicValidator,
  validate,
  requireAbility("super_admin"),
  topicController.store
);

router.patch(
  "/sso/update/:id",
  rateLimiter,
  authMiddleware,
  upload.array("files", 1),
  updateTopicValidator,
  validate,
  requireAbility("super_admin"),
  topicController.update
);

router.delete(
  "/sso/delete/:id",
  rateLimiter,
  authMiddleware,
  requireAbility("super_admin"),
  topicController.destroy
);

router.patch(
  "/sso/restore/:id",
  rateLimiter,
  authMiddleware,
  requireAbility("super_admin"),
  topicController.restore
);

module.exports = router;