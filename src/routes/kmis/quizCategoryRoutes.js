const express = require("express");
const router = express.Router();
const quizCategoryController = require("../../controllers/kmis/quizCategoryController");
const {
  storeQuizCategoryValidator,
} = require("../../validators/kmis/storeQuizCategoryValidator");
const {
  updateQuizCategoryValidator,
} = require("../../validators/kmis/updateQuizCategoryValidator");
const validate = require("../../middlewares/validate");
const authMiddleware = require("../../middlewares/authMiddleware");
const rateLimiter = require("../../middlewares/rateLimitMiddleware");
const requirePermission = require("../../middlewares/requirePermission");
const multer = require("multer");
const upload = multer();

router.use(rateLimiter, authMiddleware);

router.get(
  "/index",
  requirePermission(["view.kmis_quiz"]),
  quizCategoryController.index
);

router.get(
  "/show/:id",
  requirePermission(["view.kmis_quiz"]),
  quizCategoryController.show
);

router.post(
  "/create",
  requirePermission(["create.kmis_quiz"]),
  upload.none(),
  storeQuizCategoryValidator,
  validate,
  quizCategoryController.store
);

router.patch(
  "/update/:id",
  requirePermission(["edit.kmis_quiz"]),
  upload.none(),
  updateQuizCategoryValidator,
  validate,
  quizCategoryController.update
);

router.delete(
  "/delete",
  requirePermission(["delete.kmis_quiz"]),
  quizCategoryController.destroy
);

router.patch(
  "/restore",
  requirePermission(["restore.kmis_quiz"]),
  quizCategoryController.restore
);

module.exports = router;
