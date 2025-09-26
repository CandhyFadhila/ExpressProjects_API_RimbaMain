const express = require("express");
const router = express.Router();
const rateLimiter = require("../../middlewares/rateLimitMiddleware");
const publicRequestController = require("../../controllers/publicRequest/publicRequestController");

// Role
router.get(
  "/get-all-role",
  rateLimiter,
  publicRequestController.getAllRole
);

// Category
router.get(
  "/get-all-category",
  rateLimiter,
  publicRequestController.getAllCategory
);

router.get(
  "/get-category/:id",
  rateLimiter,
  publicRequestController.getCategorybyId
);

// Topic
router.get(
  "/get-all-topic",
  rateLimiter,
  publicRequestController.getAllTopic
);

router.get(
  "/get-topic/:id",
  rateLimiter,
  publicRequestController.getTopicbyId
);

router.get(
  "/get-topic-by-category/:id",
  rateLimiter,
  publicRequestController.getTopicbyCategoryId
);

// User
router.get(
  "/get-all-user",
  rateLimiter,
  publicRequestController.getAllUser
);

router.get(
  "/get-all-user-educator",
  rateLimiter,
  publicRequestController.getAllUserEducator
);

router.get(
  "/get-all-user-student",
  rateLimiter,
  publicRequestController.getAllUserStudent
);

router.get(
  "/get-user-by-role/:id",
  rateLimiter,
  publicRequestController.getAllUserbyRoleId
);

router.get(
  "/get-user/:id",
  rateLimiter,
  publicRequestController.getUserbyId
);

// Material
router.get(
  "/get-all-material",
  rateLimiter,
  publicRequestController.getAllMaterial
);

router.get(
  "/get-material/:id",
  rateLimiter,
  publicRequestController.getMaterialbyId
);

router.post(
  "/get-material-by-category-topic",
  rateLimiter,
  publicRequestController.getMaterialbyTopicIdorCategoryId
);

router.get(
  "/get-material-by-created/:id",
  rateLimiter,
  publicRequestController.getMaterialbyCreatedId
);

router.get(
  "/get-material-by-uploaded/:id",
  rateLimiter,
  publicRequestController.getMaterialbyUploadedId
);

router.post(
  "/get-material-by-type",
  rateLimiter,
  publicRequestController.getMaterialbyMaterialTypes
);

router.post(
  "/get-material-by-public",
  rateLimiter,
  publicRequestController.getMaterialbyIsPublic
);

// Quiz Category
router.get(
  "/get-all-quiz-category",
  rateLimiter,
  publicRequestController.getAllQuizCategory
);

router.get(
  "/get-quiz-category/:id",
  rateLimiter,
  publicRequestController.getQuizCategorybyId
);

router.post(
  "/get-quiz-category-by-category-topic",
  rateLimiter,
  publicRequestController.getQuizCategorybyTopicIdorCategoryId
);

// Quiz
router.get(
  "/get-all-quiz",
  rateLimiter,
  publicRequestController.getAllQuiz
);

router.get(
  "/get-quiz/:id",
  rateLimiter,
  publicRequestController.getQuizbyId
);

// router.post(
//   "/get-quiz-by-category-topic",
//   rateLimiter,
//   publicRequestController.getQuizbyTopicIdorCategoryId
// );

module.exports = router;