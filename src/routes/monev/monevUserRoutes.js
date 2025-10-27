const express = require("express");
const router = express.Router();
const monevUserController = require("../../controllers/monev/monevUserController");
const {
  storeMonevUserValidator,
} = require("../../validators/monev/storeMonevUserValidator");
const validate = require("../../middlewares/validate");
const authMiddleware = require("../../middlewares/authMiddleware");
const rateLimiter = require("../../middlewares/rateLimitMiddleware");
const requirePermission = require("../../middlewares/requirePermission");
const multer = require("multer");
const upload = multer();

router.use(rateLimiter, authMiddleware);

router.get(
  "/index",
  requirePermission(["view.monev_user"]),
  monevUserController.index
);

router.get(
  "/show/:id",
  requirePermission(["view.monev_user"]),
  monevUserController.show
);

router.post(
  "/create",
  requirePermission(["create.monev_user"]),
  upload.none(),
  storeMonevUserValidator,
  validate,
  monevUserController.store
);

router.patch(
  "/deactivate",
  requirePermission(["edit.monev_user"]),
  monevUserController.deactivateAccount
);

router.patch(
  "/activate",
  requirePermission(["edit.monev_user"]),
  monevUserController.activateAccount
);

module.exports = router;
