const express = require("express");
const router = express.Router();
const studentLearningCourseController = require("../../controllers/kmis/studentLearningCourseController");
const {
  storeLearningAttemptValidator,
} = require("../../validators/kmis/storeLearningAttemptValidator");
const {
  updateProgressLearningAttemptValidator,
} = require("../../validators/kmis/updateProgressLearningAttemptValidator");
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

router.use(rateLimiter, authMiddleware, requireAbility("student"));

// Learning Attempt
router.post(
  "/create",
  requirePermission(["create.kmis_learning_course"]),
  upload.none(),
  storeLearningAttemptValidator,
  validate,
  studentLearningCourseController.storeLearningAttempt
);

router.post(
  "/progress-update/:id",
  requirePermission(["edit.kmis_learning_course"]),
  upload.none(),
  updateProgressLearningAttemptValidator,
  validate,
  studentLearningCourseController.updateProgressLearningAttempt
);

router.patch(
  "/feedback/:id",
  requirePermission(["edit.kmis_learning_course"]),
  upload.none(),
  updateFeedbackValidator,
  validate,
  studentLearningCourseController.feedback
);

module.exports = router;
