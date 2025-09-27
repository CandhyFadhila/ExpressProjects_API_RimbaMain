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
  requirePermission(["view.kmis_quiz"]),
  quizController.index
);

router.get(
  "/educator/show/:id",
  requirePermission(["view.kmis_quiz"]),
  quizController.show
);

router.post(
  "/educator/create",
  requirePermission(["create.kmis_quiz"]),
  upload.none(),
  storeQuizValidator,
  validate,
  quizController.store
);

router.patch(
  "/educator/update/:id",
  requirePermission(["edit.kmis_quiz"]),
  upload.none(),
  updateQuizValidator,
  validate,
  quizController.update
);

router.delete(
  "/educator/delete",
  requirePermission(["delete.kmis_quiz"]),
  quizController.destroy
);

router.patch(
  "/educator/restore",
  requirePermission(["restore.kmis_quiz"]),
  quizController.restore
);

router.get(
  "/educator/download-template",
  requirePermission(["create.kmis_quiz"]),
  quizController.downloadTemplate
);

router.post(
  "/educator/import",
  requirePermission(["create.kmis_quiz"]),
  upload.array("files", 20),
  validate,
  quizController.importTemplate
);

module.exports = router;
