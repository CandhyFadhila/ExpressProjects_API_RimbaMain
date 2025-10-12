const express = require("express");
const router = express.Router();
const studentLearningCourseController = require("../../controllers/kmis/studentLearningCourseController");
const {
  storeLearningAttemptValidator,
} = require("../../validators/kmis/storeLearningAttemptValidator");
const {
  updateFeedbackValidator,
} = require("../../validators/kmis/updateFeedbackValidator");
const validate = require("../../middlewares/validate");
const authMiddleware = require("../../middlewares/authMiddleware");
const rateLimiter = require("../../middlewares/rateLimitMiddleware");
const requirePermission = require("../../middlewares/requirePermission");
const requireAbility = require("../../middlewares/requireAbility");
const multer = require("multer");
const upload = multer();

// Learning Attempt
router.get(
  "/get-all-learning-attempt",
  rateLimiter,
  authMiddleware,
  requireAbility("student"),
  requirePermission(["view.kmis_learning_course"]),
  studentLearningCourseController.getListLearningAttempt
);

router.get(
  "/show/:id",
  rateLimiter,
  studentLearningCourseController.getDetailLearningAttemptbyTopicId
);

router.get(
  "/detail/:id",
  rateLimiter,
  authMiddleware,
  requireAbility("student"),
  requirePermission(["view.kmis_learning_course"]),
  studentLearningCourseController.getOrderMaterialLearningAttemptbyTopicId
);

router.get(
  "/get-quiz-by-topic/:id",
  rateLimiter,
  authMiddleware,
  requireAbility("student"),
  requirePermission(["view.kmis_learning_course"]),
  studentLearningCourseController.getAllQuizbyTopicId
);

router.post(
  "/create",
  rateLimiter,
  authMiddleware,
  requireAbility("student"),
  requirePermission(["create.kmis_learning_course"]),
  upload.none(),
  storeLearningAttemptValidator,
  validate,
  studentLearningCourseController.storeLearningAttempt
);

router.patch(
  "/update/:id",
  rateLimiter,
  authMiddleware,
  requireAbility("student"),
  requirePermission(["edit.kmis_learning_course"]),
  studentLearningCourseController.updateProgressLearningAttempt
);

router.patch(
  "/feedback/:id",
  rateLimiter,
  authMiddleware,
  requireAbility("student"),
  requirePermission(["edit.kmis_learning_course"]),
  upload.none(),
  updateFeedbackValidator,
  validate,
  studentLearningCourseController.feedback
);

module.exports = router;
