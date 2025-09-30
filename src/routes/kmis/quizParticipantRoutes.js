const express = require("express");
const router = express.Router();
const quizPartisipantController = require("../../controllers/kmis/quizPartisipantController");
const authMiddleware = require("../../middlewares/authMiddleware");
const rateLimiter = require("../../middlewares/rateLimitMiddleware");
const requirePermission = require("../../middlewares/requirePermission");

router.use(rateLimiter, authMiddleware);

router.get(
  "/index",
  requirePermission(["view.kmis_quiz"]),
  quizPartisipantController.index
);

router.get(
  "/download-certificate/:id",
  requirePermission(["create.kmis_quiz"]),
  quizPartisipantController.generateCertificate
);

module.exports = router;
