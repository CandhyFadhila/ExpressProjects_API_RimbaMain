const express = require("express");
const router = express.Router();
const animalCompositionController = require("../../controllers/cms/animalCompositionController");
const {
  storeAnimalCompositionValidator,
} = require("../../validators/cms/storeAnimalCompositionValidator");
const {
  updateAnimalCompositionValidator,
} = require("../../validators/cms/updateAnimalCompositionValidator");
const validate = require("../../middlewares/validate");
const authMiddleware = require("../../middlewares/authMiddleware");
const rateLimiter = require("../../middlewares/rateLimitMiddleware");
const requirePermission = require("../../middlewares/requirePermission");
const multer = require("multer");
const upload = multer();

router.use(rateLimiter, authMiddleware);

router.get(
  "/index",
  requirePermission(["view.cms_management"]),
  animalCompositionController.index
);

router.get(
  "/show/:id",
  requirePermission(["view.cms_management"]),
  animalCompositionController.show
);

router.post(
  "/create",
  requirePermission(["create.cms_management"]),
  upload.array("files", 20),
  storeAnimalCompositionValidator,
  validate,
  animalCompositionController.store
);

router.patch(
  "/update/:id",
  requirePermission(["edit.cms_management"]),
  upload.array("files", 20),
  updateAnimalCompositionValidator,
  validate,
  animalCompositionController.update
);

router.delete(
  "/delete",
  requirePermission(["delete.cms_management"]),
  animalCompositionController.destroy
);

router.patch(
  "/restore",
  requirePermission(["restore.cms_management"]),
  animalCompositionController.restore
);

module.exports = router;
