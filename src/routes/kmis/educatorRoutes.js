const express = require("express");
const router = express.Router();
const educatorController = require("../../controllers/kmis/educatorController");
const { storeEducatorValidator } = require("../../validators/kmis/storeEducatorValidator");
const { updateEducatorValidator } = require("../../validators/kmis/updateEducatorValidator");
const validate = require("../../middlewares/validate");
const authMiddleware = require("../../middlewares/authMiddleware");
const rateLimiter = require("../../middlewares/rateLimitMiddleware");
const requireAbility = require("../../middlewares/requireAbility");
const requirePermission = require("../../middlewares/requirePermission");

router.use(
  rateLimiter,
  authMiddleware,
  requireAbility("super_admin")
);

router.get(
  "/sso/index",
  requirePermission(["view.kmis_educator"]),
  educatorController.index
);

router.get(
  "/sso/show/:id",
  requirePermission(["view.kmis_educator"]),
  educatorController.show
);

router.post(
  "/sso/create",
  requirePermission(["create.kmis_educator"]),
  storeEducatorValidator,
  validate,
  educatorController.store
);

router.patch(
  "/sso/update/:id",
  requirePermission(["update.kmis_educator"]),
  updateEducatorValidator,
  validate,
  educatorController.update
);

router.delete(
  "/sso/delete",
  requirePermission(["delete.kmis_educator"]),
  educatorController.destroy
);

router.patch(
  "/sso/restore",
  requirePermission(["restore.kmis_educator"]),
  educatorController.restore
);

router.patch(
  "/sso/deactivate",
  requirePermission(["update.kmis_educator"]),
  educatorController.deactivateAccount
);

router.patch(
  "/sso/activate",
  requirePermission(["update.kmis_educator"]),
  educatorController.activateAccount
);

module.exports = router;