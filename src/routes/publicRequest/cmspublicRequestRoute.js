const express = require("express");
const router = express.Router();
const rateLimiter = require("../../middlewares/rateLimitMiddleware");
const publicRequestController = require("../../controllers/publicRequest/publicRequestController");

router.get(
  "/get-all-news-category",
  rateLimiter,
  publicRequestController.getAllNewsCategory
);

router.get(
  "/get-news-category/:id",
  rateLimiter,
  publicRequestController.getNewsCategorybyId
);

router.get(
  "/get-all-event-category",
  rateLimiter,
  publicRequestController.getAllEventCategory
);

router.get(
  "/get-event-category/:id",
  rateLimiter,
  publicRequestController.getEventCategorybyId
);

router.get(
  "/get-all-event",
  rateLimiter,
  publicRequestController.getAllEvent
);

router.get(
  "/get-event/:id",
  rateLimiter,
  publicRequestController.getEventbyId
);

router.get(
  "/get-event-by-category/:id",
  rateLimiter,
  publicRequestController.getEventbyEventCategoryId
);

router.get(
  "/get-all-news",
  rateLimiter,
  publicRequestController.getAllNews
);

router.get(
  "/get-news/:id",
  rateLimiter,
  publicRequestController.getNewsbyId
);

router.get(
  "/get-news-by-category/:id",
  rateLimiter,
  publicRequestController.getNewsbyNewsCategoryId
);

router.get(
  "/get-news-by-slug/:slug",
  rateLimiter,
  publicRequestController.getNewsbySlug
);

router.get(
  "/get-all-content",
  rateLimiter,
  publicRequestController.getAllContent
);

router.get(
  "/get-content/:id",
  rateLimiter,
  publicRequestController.getContentbyOrder
);

router.post(
  "/get-content-hero",
  rateLimiter,
  publicRequestController.getContentHero
);

module.exports = router;