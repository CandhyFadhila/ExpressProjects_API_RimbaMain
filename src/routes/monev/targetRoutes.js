const express = require("express");
const router = express.Router();
const targetController = require("../../controllers/monev/targetController");
const {
  updateTargetValidator,
} = require("../../validators/monev/updateTargetValidator");
const validate = require("../../middlewares/validate");
const authMiddleware = require("../../middlewares/authMiddleware");
const rateLimiter = require("../../middlewares/rateLimitMiddleware");
const requirePermission = require("../../middlewares/requirePermission");
const multer = require("multer");
const upload = multer();

router.use(rateLimiter, authMiddleware);

router.get(
  "/:id",
  requirePermission(["view.monev_target"]),
  targetController.getTargetbyActivityPackageId
);

router.patch(
  "/update/:id",
  requirePermission(["edit.monev_target"]),
  upload.none(),
  updateTargetValidator,
  validate,
  targetController.update
);

module.exports = router;
