const express = require("express");
const router = express.Router();
const authMiddleware = require("../../middlewares/authMiddleware");
const rateLimiter = require("../../middlewares/rateLimitMiddleware");
const publicRequestController = require("../../controllers/publicRequest/publicRequestController");

// Role
router.get(
  "/get-all-role",
  rateLimiter,
  publicRequestController.getAllRole
);

// User
router.get(
  "/get-all-user",
  rateLimiter,
  publicRequestController.getAllUser
);

router.get(
  "/get-all-user-educator-admin",
  rateLimiter,
  authMiddleware,
  publicRequestController.getAllUserEducatorWithAuth
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