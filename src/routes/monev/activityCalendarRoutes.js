const express = require("express");
const router = express.Router();
const activityCalendarController = require("../../controllers/monev/activityCalendarController");
const {
  storeActivityCalendarValidator,
} = require("../../validators/monev/storeActivityCalendarValidator");
const {
  updateActivityCalendarValidator,
} = require("../../validators/monev/updateActivityCalendarValidator");
const validate = require("../../middlewares/validate");
const authMiddleware = require("../../middlewares/authMiddleware");
const rateLimiter = require("../../middlewares/rateLimitMiddleware");
const requirePermission = require("../../middlewares/requirePermission");
const multer = require("multer");
const upload = multer();

router.use(rateLimiter, authMiddleware);

router.get(
  "/index",
  requirePermission(["view.monev_activity_calendar"]),
  activityCalendarController.index
);

router.get(
  "/show/:id",
  requirePermission(["view.monev_activity_calendar"]),
  activityCalendarController.show
);

router.post(
  "/create",
  requirePermission(["create.monev_activity_calendar"]),
  upload.none(),
  storeActivityCalendarValidator,
  validate,
  activityCalendarController.store
);

router.patch(
  "/update/:id",
  requirePermission(["edit.monev_activity_calendar"]),
  upload.none(),
  updateActivityCalendarValidator,
  validate,
  activityCalendarController.update
);

router.delete(
  "/delete",
  requirePermission(["delete.monev_activity_calendar"]),
  activityCalendarController.destroy
);

router.patch(
  "/restore",
  requirePermission(["restore.monev_activity_calendar"]),
  activityCalendarController.restore
);

module.exports = router;
