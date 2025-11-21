const express = require("express");
const router = express.Router();
const logger = require("../../utils/logger");
const knex = require("../../config/database");
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
  async (req, res, next) => {
    try {
      const { id } = req.params;

      // Cek topic berdasarkan ID
      const topic = await knex("kmis_topics")
        .select("id", "material_order_ids", "topic_type")
        .where("id", id)
        .first();
      if (!topic) {
        const response = new WithoutDataResource(
          422,
          "TOPIC_INVALID",
          "Topik Tidak Valid",
          `Topik dengan ID '${id}' tidak ditemukan.`
        );
        return res.status(422).json(response.toResponse());
      }

      // Jika topic_type adalah "Pengetahuan", lewati authMiddleware
      if (topic.topic_type === "Pengetahuan") {
        return next();
      }

      // Jika bukan Pengetahuan, jalankan authMiddleware
      authMiddleware(req, res, next);
    } catch (error) {
      logger.error(
        `| Topic KMIS | - Error checking topic type: ${error.message}`
      );
      return res.status(500).json({
        message: "An error occurred while processing your request.",
      });
    }
  },
  requireAbility("student"),
  requirePermission(["view.kmis_learning_course"]),
  studentLearningCourseController.getOrderMaterialLearningAttemptbyTopicId
);

router.get(
  "/get-material/:id",
  rateLimiter,
  authMiddleware,
  requireAbility("student"),
  requirePermission(["view.kmis_learning_course"]),
  studentLearningCourseController.getLearningAttemptMaterialbyId
);

router.get(
  "/get-quiz-by-topic/:id",
  rateLimiter,
  authMiddleware,
  requireAbility("student"),
  requirePermission(["view.kmis_learning_course"]),
  studentLearningCourseController.getAllQuizbyTopicId
);

router.get(
  "/get-quiz-with-answer/:id",
  rateLimiter,
  authMiddleware,
  requireAbility("student"),
  requirePermission(["view.kmis_learning_course"]),
  studentLearningCourseController.getQuizAttemptbylearningAttemptId
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

router.get(
  "/get-finished-attempt/:id",
  rateLimiter,
  authMiddleware,
  requireAbility("student"),
  requirePermission(["view.kmis_learning_course"]),
  studentLearningCourseController.getLearningAttemptCompletedById
);

module.exports = router;
