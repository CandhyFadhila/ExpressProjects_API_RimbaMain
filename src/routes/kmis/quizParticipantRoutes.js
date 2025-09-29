const express = require("express");
const router = express.Router();
const quizPartisipantController = require("../../controllers/kmis/quizPartisipantController");
const authMiddleware = require("../../middlewares/authMiddleware");
const rateLimiter = require("../../middlewares/rateLimitMiddleware");
const requireAbility = require("../../middlewares/requireAbility");
const requirePermission = require("../../middlewares/requirePermission");

router.use(rateLimiter, authMiddleware, requireAbility("educator"));

router.get(
  "/educator/index",
  requirePermission(["view.kmis_quiz"]),
  quizPartisipantController.index
);

router.get(
  "/educator/download-certificate/:id",
  requirePermission(["create.kmis_quiz"]),
  quizPartisipantController.generateCertificate
);

module.exports = router;
