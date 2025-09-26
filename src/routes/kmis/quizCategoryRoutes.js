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
const { requireAnyAbility } = require("../../middlewares/requireAbility");
const requirePermission = require("../../middlewares/requirePermission");
const multer = require("multer");
const upload = multer();

router.use(rateLimiter, authMiddleware);

router.get(
  "/educator/index",
  requireAnyAbility(["super_admin", "educator"]),
  requirePermission(["view.kmis_quiz"]),
  quizCategoryController.index
);

router.get(
  "/educator/show/:id",
  requireAnyAbility(["educator"]),
  requirePermission(["view.kmis_quiz"]),
  quizCategoryController.show
);

router.post(
  "/educator/create",
  requireAnyAbility(["educator"]),
  requirePermission(["create.kmis_quiz"]),
  upload.none(),
  storeQuizCategoryValidator,
  validate,
  quizCategoryController.store
);

router.patch(
  "/educator/update/:id",
  requireAnyAbility(["educator"]),
  requirePermission(["edit.kmis_quiz"]),
  upload.none(),
  updateQuizCategoryValidator,
  validate,
  quizCategoryController.update
);

router.delete(
  "/educator/delete",
  requireAnyAbility(["educator"]),
  requirePermission(["delete.kmis_quiz"]),
  quizCategoryController.destroy
);

router.patch(
  "/educator/restore",
  requireAnyAbility(["educator"]),
  requirePermission(["restore.kmis_quiz"]),
  quizCategoryController.restore
);

module.exports = router;
