const express = require("express");
const router = express.Router();
const quizController = require("../../controllers/kmis/quizController");
const {
  storeQuizValidator,
} = require("../../validators/kmis/storeQuizValidator");
const {
  updateQuizValidator,
} = require("../../validators/kmis/updateQuizValidator");
const validate = require("../../middlewares/validate");
const authMiddleware = require("../../middlewares/authMiddleware");
const rateLimiter = require("../../middlewares/rateLimitMiddleware");
const requireAbility = require("../../middlewares/requireAbility");
const requirePermission = require("../../middlewares/requirePermission");
const multer = require("multer");
const upload = multer();

router.use(rateLimiter, authMiddleware, requireAbility("educator"));

router.get(
  "/educator/index",
  requirePermission(["view.kmis_educator"]),
  quizController.index
);

router.get(
  "/educator/show/:id",
  requirePermission(["view.kmis_educator"]),
  quizController.show
);

router.post(
  "/educator/create",
  requirePermission(["create.kmis_educator"]),
  upload.none(),
  storeQuizValidator,
  validate,
  quizController.store
);

router.patch(
  "/educator/update/:id",
  requirePermission(["edit.kmis_educator"]),
  upload.none(),
  updateQuizValidator,
  validate,
  quizController.update
);

router.delete(
  "/educator/delete",
  requirePermission(["delete.kmis_educator"]),
  quizController.destroy
);

router.patch(
  "/educator/restore",
  requirePermission(["restore.kmis_educator"]),
  quizController.restore
);

router.get(
  "/educator/download-template",
  requirePermission(["create.kmis_educator"]),
  quizController.downloadTemplate
);

router.post(
  "/educator/import",
  requirePermission(["create.kmis_educator"]),
  upload.array("files", 1),
  validate,
  quizController.importTemplate
);

module.exports = router;
