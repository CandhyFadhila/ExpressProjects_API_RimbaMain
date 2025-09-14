const express = require("express");
const router = express.Router();
const educatorController = require("../../controllers/kmis/educatorController");
const { storeEducatorValidator } = require("../../validators/kmis/storeEducatorValidator");
const { updateEducatorValidator } = require("../../validators/kmis/updateEducatorValidator");
const validate = require("../../middlewares/validate");
const authMiddleware = require("../../middlewares/authMiddleware");
const rateLimiter = require("../../middlewares/rateLimitMiddleware");
const requireAbility = require("../../middlewares/requireAbility");

router.use(
  rateLimiter,
  authMiddleware,
  requireAbility("super_admin")
);

router.get(
  "/sso/index",
  educatorController.index
);

router.get(
  "/sso/show/:id",
  educatorController.show
);

router.post(
  "/sso/create",
  storeEducatorValidator,
  validate,
  educatorController.store
);

router.patch(
  "/sso/update/:id",
  updateEducatorValidator,
  validate,
  educatorController.update
);

router.delete(
  "/sso/delete",
  educatorController.destroy
);

router.patch(
  "/sso/restore",
  educatorController.restore
);

router.patch(
  "/sso/deactivate",
  educatorController.deactivateAccount
);

router.patch(
  "/sso/activate",
  educatorController.activateAccount
);

module.exports = router;