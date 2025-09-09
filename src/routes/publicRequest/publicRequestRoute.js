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

module.exports = router;