const express = require("express");
const router = express.Router();
const picDivisionController = require("../../controllers/masterData/picDivisionController");
const {
  storePicDivisionValidator,
} = require("../../validators/masterData/storePicDivisionValidator");
const {
  updatePicDivisionValidator,
} = require("../../validators/masterData/updatePicDivisionValidator");
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
  picDivisionController.index
);

router.get(
  "/show/:id",
  requirePermission(["view.master_data"]),
  picDivisionController.show
);

router.post(
  "/create",
  requirePermission(["create.master_data"]),
  upload.none(),
  storePicDivisionValidator,
  validate,
  picDivisionController.store
);

router.patch(
  "/update/:id",
  requirePermission(["edit.master_data"]),
  upload.none(),
  updatePicDivisionValidator,
  validate,
  picDivisionController.update
);

router.delete(
  "/delete",
  requirePermission(["delete.master_data"]),
  picDivisionController.destroy
);

router.patch(
  "/restore",
  requirePermission(["restore.master_data"]),
  picDivisionController.restore
);

module.exports = router;
