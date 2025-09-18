const express = require("express");
const router = express.Router();
const materialController = require("../../controllers/kmis/materialController");
const {
  storeMaterialValidator,
} = require("../../validators/kmis/storeMaterialValidator");
const {
  updateMaterialValidator,
} = require("../../validators/kmis/updateMaterialValidator");
const validate = require("../../middlewares/validate");
const authMiddleware = require("../../middlewares/authMiddleware");
const rateLimiter = require("../../middlewares/rateLimitMiddleware");
const { requireAnyAbility } = require("../../middlewares/requireAbility");
const requirePermission = require("../../middlewares/requirePermission");
const multer = require("multer");
const upload = multer();
const uploadMaterialFields = upload.fields([
  { name: "materialCovers", maxCount: 1 },
  { name: "materialFiles", maxCount: 10 },
]);

router.use(
  rateLimiter,
  authMiddleware,
  requireAnyAbility(["super_admin", "educator"])
);

router.get(
  "/index",
  requirePermission(["view.kmis_material"]),
  materialController.index
);

router.get(
  "/show/:id",
  requirePermission(["view.kmis_material"]),
  materialController.show
);

router.post(
  "/create",
  requirePermission(["create.kmis_material"]),
  uploadMaterialFields,
  storeMaterialValidator,
  validate,
  materialController.store
);

router.patch(
  "/update/:id",
  requirePermission(["update.kmis_material"]),
  uploadMaterialFields,
  updateMaterialValidator,
  validate,
  materialController.update
);

router.delete(
  "/delete",
  requirePermission(["delete.kmis_material"]),
  materialController.destroy
);

router.patch(
  "/restore",
  requirePermission(["restore.kmis_material"]),
  materialController.restore
);

module.exports = router;
