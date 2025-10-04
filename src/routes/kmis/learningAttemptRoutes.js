const express = require("express");
const router = express.Router();
const studentLearningCourseController = require("../../controllers/kmis/studentLearningCourseController");
const {
  storeLearningAttemptValidator,
} = require("../../validators/kmis/storeLearningAttemptValidator");
const {
  storeQuizAttemptValidator,
} = require("../../validators/kmis/storeQuizAttemptValidator");
const {
  updateProgressLearningAttemptValidator,
} = require("../../validators/kmis/updateProgressLearningAttemptValidator");
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

// Quiz Attempt
router.post(
  "/create",
  requirePermission(["create.kmis_learning_course"]),
  upload.none(),
  storeQuizAttemptValidator,
  validate,
  studentLearningCourseController.storeQuizAttempt
);

module.exports = router;
