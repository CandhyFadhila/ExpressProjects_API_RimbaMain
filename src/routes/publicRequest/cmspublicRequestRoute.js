const express = require("express");
const router = express.Router();
const rateLimiter = require("../../middlewares/rateLimitMiddleware");
const publicRequestController = require("../../controllers/publicRequest/publicRequestController");

// News
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

router.get("/get-all-news", rateLimiter, publicRequestController.getAllNews);

router.get("/get-news/:id", rateLimiter, publicRequestController.getNewsbyId);

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

// Event
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

router.get("/get-all-event", rateLimiter, publicRequestController.getAllEvent);

router.get("/get-event/:id", rateLimiter, publicRequestController.getEventbyId);

router.get(
  "/get-event-by-category/:id",
  rateLimiter,
  publicRequestController.getEventbyEventCategoryId
);

// Animal
router.get(
  "/get-all-animal-category",
  rateLimiter,
  publicRequestController.getAllAnimalCategory
);

router.get(
  "/get-animal-category/:id",
  rateLimiter,
  publicRequestController.getAnimalCategorybyId
);

router.get(
  "/get-all-animal",
  rateLimiter,
  publicRequestController.getAllAnimalComposition
);

router.get(
  "/get-animal/:id",
  rateLimiter,
  publicRequestController.getAnimalCompositionbyId
);

router.get(
  "/get-animal-by-category/:id",
  rateLimiter,
  publicRequestController.getAnimalCompositionbyAnimalCategoryId
);

// Legal Document
router.get(
  "/get-all-docs-category",
  rateLimiter,
  publicRequestController.getAllLegalDocumentCategory
);

router.get(
  "/get-docs-category/:id",
  rateLimiter,
  publicRequestController.getLegalDocumentCategorybyId
);

router.get(
  "/get-all-legal-document",
  rateLimiter,
  publicRequestController.getAllLegalDocument
);

router.get(
  "/get-legal-document/:id",
  rateLimiter,
  publicRequestController.getLegalDocumentbyId
);

router.get(
  "/get-legal-document-by-category/:id",
  rateLimiter,
  publicRequestController.getLegalDocumentbyLegalDocumentCategoryId
);

// FAQs
router.get("/get-all-faq", rateLimiter, publicRequestController.getAllFaq);

router.get("/get-faq/:id", rateLimiter, publicRequestController.getFaqbyId);

// Content
router.get(
  "/get-all-content",
  rateLimiter,
  publicRequestController.getAllContent
);

module.exports = router;
