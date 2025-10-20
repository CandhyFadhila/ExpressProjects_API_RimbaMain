const express = require("express");
const router = express.Router();
const dashboardController = require("../../controllers/kmis/dashboardController");
const authMiddleware = require("../../middlewares/authMiddleware");
const rateLimiter = require("../../middlewares/rateLimitMiddleware");
const requirePermission = require("../../middlewares/requirePermission");

router.use(rateLimiter, authMiddleware);

router.get(
  "/info",
  requirePermission(["view.kmis_dashboard"]),
  dashboardController.dashboardInfo
);

module.exports = router;
