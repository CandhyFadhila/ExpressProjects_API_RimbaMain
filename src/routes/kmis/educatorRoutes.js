const express = require("express");
const router = express.Router();
const educatorController = require("../../controllers/kmis/educatorController");
const { storeEducatorValidator } = require("../../validators/kmis/storeEducatorValidator");
const { updateEducatorValidator } = require("../../validators/kmis/updateEducatorValidator");
const validate = require("../../middlewares/validate");
const authMiddleware = require("../../middlewares/authMiddleware");
const rateLimiter = require("../../middlewares/rateLimitMiddleware");
const requireAbility = require("../../middlewares/requireAbility");

router.get(
  "/sso/index",
  rateLimiter,
  authMiddleware,
  requireAbility("super_admin"),
  educatorController.index
);

router.get(
  "/sso/show/:id",
  rateLimiter,
  authMiddleware,
  requireAbility("super_admin"),
  educatorController.show
);

router.post(
  "/sso/create",
  rateLimiter,
  authMiddleware,
  storeEducatorValidator,
  validate,
  requireAbility("super_admin"),
  educatorController.store
);

router.patch(
  "/sso/update/:id",
  rateLimiter,
  authMiddleware,
  updateEducatorValidator,
  validate,
  requireAbility("super_admin"),
  educatorController.update
);

router.delete(
  "/sso/delete",
  rateLimiter,
  authMiddleware,
  requireAbility("super_admin"),
  educatorController.destroy
);

router.patch(
  "/sso/restore",
  rateLimiter,
  authMiddleware,
  requireAbility("super_admin"),
  educatorController.restore
);

router.patch(
  "/sso/deactivate",
  rateLimiter,
  authMiddleware,
  requireAbility("super_admin"),
  educatorController.deactivateAccount
);

router.patch(
  "/sso/activate",
  rateLimiter,
  authMiddleware,
  requireAbility("super_admin"),
  educatorController.activateAccount
);

module.exports = router;