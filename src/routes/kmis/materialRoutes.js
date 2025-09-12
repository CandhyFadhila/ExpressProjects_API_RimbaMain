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
  materialController.index
);

router.get(
  "/show/:id",
  materialController.show
);

router.post(
  "/create",
  uploadMaterialFields,
  storeMaterialValidator,
  validate,
  materialController.store
);

router.patch(
  "/update/:id",
  uploadMaterialFields,
  updateMaterialValidator,
  validate,
  materialController.update
);

router.delete(
  "/delete",
  materialController.destroy
);

router.patch(
  "/restore",
  materialController.restore
);

module.exports = router;
