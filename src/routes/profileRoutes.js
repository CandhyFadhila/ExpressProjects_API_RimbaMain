const express = require("express");
const router = express.Router();
const profileController = require("../controllers/profileController");
const { profileValidator } = require("../validators/profileValidator");
const validate = require("../middlewares/validate");
const authMiddleware = require("../middlewares/authMiddleware");
const rateLimiter = require("../middlewares/rateLimitMiddleware");
const { requireAnyAbility } = require("../middlewares/requireAbility");
const multer = require("multer");
const upload = multer();
const uploadMaterialFields = upload.fields([{ name: "files", maxCount: 1 }]);

router.use(
  rateLimiter,
  authMiddleware
);

router.get(
  "/get-user-profile",
  requireAnyAbility(["super_admin", "educator", "student"]),
  profileController.getUserProfile
);

router.get(
  "/activity-log/:id",
  requireAnyAbility(["super_admin", "educator"]),
  profileController.getUserActivitybyUserId
);

router.patch(
  "/update-profile",
  uploadMaterialFields,
  profileValidator,
  validate,
  requireAnyAbility(["super_admin", "educator", "student"]),
  profileController.updateUserData
);

module.exports = router;
