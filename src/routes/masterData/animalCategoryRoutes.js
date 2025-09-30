const express = require("express");
const router = express.Router();
const animalCategoryController = require("../../controllers/masterData/animalCategoryController");
const {
  storeAnimalCategoryValidator,
} = require("../../validators/masterData/storeAnimalCategoryValidator");
const {
  updateAnimalCategoryValidator,
} = require("../../validators/masterData/updateAnimalCategoryValidator");
const validate = require("../../middlewares/validate");
const authMiddleware = require("../../middlewares/authMiddleware");
const rateLimiter = require("../../middlewares/rateLimitMiddleware");
const requirePermission = require("../../middlewares/requirePermission");
const multer = require("multer");
const upload = multer();

router.use(rateLimiter, authMiddleware);

router.get(
  "/index",
  requirePermission(["view.master_data"]),
  animalCategoryController.index
);

router.get(
  "/show/:id",
  requirePermission(["view.master_data"]),
  animalCategoryController.show
);

router.post(
  "/create",
  requirePermission(["create.master_data"]),
  upload.none(),
  storeAnimalCategoryValidator,
  validate,
  animalCategoryController.store
);

router.patch(
  "/update/:id",
  requirePermission(["edit.master_data"]),
  upload.none(),
  updateAnimalCategoryValidator,
  validate,
  animalCategoryController.update
);

router.delete(
  "/delete",
  requirePermission(["delete.master_data"]),
  animalCategoryController.destroy
);

router.patch(
  "/restore",
  requirePermission(["restore.master_data"]),
  animalCategoryController.restore
);

module.exports = router;
