const express = require("express");
const router = express.Router();
const authMiddleware = require("../../middlewares/authMiddleware");
const rateLimiter = require("../../middlewares/rateLimitMiddleware");
const publicRequestController = require("../../controllers/publicRequest/publicRequestController");

function authIfTrainingTopic(req, res, next) {
  const rawType = req.query.topicType ?? req.query["topicType[]"];

  const topicTypeList = Array.isArray(rawType)
    ? rawType
    : rawType
    ? [rawType]
    : [];

  if (
    topicTypeList.includes("Pelatihan") &&
    topicTypeList.includes("Pengetahuan")
  ) {
    return next();
  }

  if (topicTypeList.includes("Pelatihan")) {
    return authMiddleware(req, res, next);
  }

  return next();
}

// Role
router.get("/get-all-role", rateLimiter, publicRequestController.getAllRole);

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
  authIfTrainingTopic,
  publicRequestController.getAllTopic
);

router.get(
  "/get-all-topic-admin",
  rateLimiter,
  authMiddleware,
  publicRequestController.getAllTopicWithAuth
);

router.get("/get-topic/:id", rateLimiter, publicRequestController.getTopicbyId);

router.get(
  "/get-topic-by-category/:id",
  rateLimiter,
  publicRequestController.getTopicbyCategoryId
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

// Quiz
router.get("/get-all-quiz", rateLimiter, publicRequestController.getAllQuiz);

router.get("/get-quiz/:id", rateLimiter, publicRequestController.getQuizbyId);

router.post(
  "/get-quiz-by-category-topic",
  rateLimiter,
  publicRequestController.getQuizbytopicId
);

module.exports = router;
