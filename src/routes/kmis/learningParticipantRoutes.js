const express = require("express");
const router = express.Router();
const learningPartisipantController = require("../../controllers/kmis/learningPartisipantController");
const authMiddleware = require("../../middlewares/authMiddleware");
const rateLimiter = require("../../middlewares/rateLimitMiddleware");
const requirePermission = require("../../middlewares/requirePermission");

router.use(rateLimiter, authMiddleware);

// TODO: Buat fitur student (create learning quiz) dulu baru bisa di test
router.get(
  "/index",
  requirePermission(["view.kmis_quiz"]),
  learningPartisipantController.index
);

router.get(
  "/show/:id",
  requirePermission(["view.kmis_quiz"]),
  learningPartisipantController.show
);

module.exports = router;
