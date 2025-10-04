const express = require("express");
const router = express.Router();
const studentLearningCourseController = require("../../controllers/kmis/studentLearningCourseController");
const {
  storeQuizAttemptValidator,
} = require("../../validators/kmis/storeQuizAttemptValidator");
const {
  storeSubmitAllAttemptValidator,
} = require("../../validators/kmis/storeSubmitAllAttemptValidator");
const validate = require("../../middlewares/validate");
const authMiddleware = require("../../middlewares/authMiddleware");
const rateLimiter = require("../../middlewares/rateLimitMiddleware");
const requirePermission = require("../../middlewares/requirePermission");
const requireAbility = require("../../middlewares/requireAbility");
const multer = require("multer");
const upload = multer();

router.use(rateLimiter, authMiddleware, requireAbility("student"));

// Quiz Attempt
router.post(
  "/create",
  requirePermission(["create.kmis_learning_course"]),
  upload.none(),
  storeQuizAttemptValidator,
  validate,
  studentLearningCourseController.storeQuizAttempt
);

router.post(
  "/submit-answer",
  requirePermission(["create.kmis_learning_course"]),
  upload.none(),
  storeSubmitAllAttemptValidator,
  validate,
  studentLearningCourseController.submitAllAttempt
);

module.exports = router;
