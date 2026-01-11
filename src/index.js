require("dotenv").config();
const helmet = require("helmet");
const express = require("express");
const morgan = require("morgan");
const corsMiddleware = require("./middlewares/cors");
const publicRequestRoute = require("./routes/publicRequest/publicRequestRoute");
const cmspublicRequestRoute = require("./routes/publicRequest/cmspublicRequestRoute");
const kmispublicRequestRoute = require("./routes/publicRequest/kmispublicRequestRoute");
const authRoutes = require("./routes/authRoutes");
const dashboardRoutes = require("./routes/kmis/dashboardRoutes");
const categoryRoutes = require("./routes/kmis/categoryRoutes");
const topicRoutes = require("./routes/kmis/topicRoutes");
const educatorRoutes = require("./routes/kmis/educatorRoutes");
const studentRoutes = require("./routes/kmis/studentRoutes");
const materialRoutes = require("./routes/kmis/materialRoutes");
const quizRoutes = require("./routes/kmis/quizRoutes");
const learningParticipantRoutes = require("./routes/kmis/learningParticipantRoutes");
const learningAttemptRoutes = require("./routes/kmis/learningAttemptRoutes");
const quizAttemptRoutes = require("./routes/kmis/quizAttemptRoutes");
const profileRoutes = require("./routes/profileRoutes");
const newsCategoryRoutes = require("./routes/masterData/newsCategoryRoutes");
const legalDocsCategoryRoutes = require("./routes/masterData/legalDocsCategoryRoutes");
const eventCategoryRoutes = require("./routes/masterData/eventCategoryRoutes");
const animalCategoryRoutes = require("./routes/masterData/animalCategoryRoutes");
const activityCategoryRoutes = require("./routes/masterData/activityCategoryRoutes");
const picDivisionRoutes = require("./routes/masterData/picDivisionRoutes");
const monevDashboardRoutes = require("./routes/masterData/monevDashboardRoutes");
const faqRoutes = require("./routes/cms/faqRoutes");
const contentRoutes = require("./routes/cms/contentRoutes");
const newsRoutes = require("./routes/cms/newsRoutes");
const eventRoutes = require("./routes/cms/eventRoutes");
const animalCompositionRoutes = require("./routes/cms/animalCompositionRoutes");
const legalDocumentRoutes = require("./routes/cms/legalDocumentRoutes");
const monevUserRoutes = require("./routes/monev/monevUserRoutes");
const activityPackageRoutes = require("./routes/monev/activityPackageRoutes");
const targetRoutes = require("./routes/monev/targetRoutes");
const monthlyRealizationRoutes = require("./routes/monev/monthlyRealizationRoutes");
const activityCalendarRoutes = require("./routes/monev/activityCalendarRoutes");
const shareReportRoutes = require("./routes/monev/shareReportRoutes");
const { isLinux, resolvePublicBaseUrl } = require("./utils/baseUrl");

const app = express();

app.use(helmet());

if (isLinux()) {
  app.set("trust proxy", 1);
}

const PORT = Number(process.env.PORT);
const DOCS_PORT = Number(process.env.DOC_SERVER_PORT);

app.locals.baseUrl = resolvePublicBaseUrl("app", {
  app: PORT,
  docs: DOCS_PORT,
});
app.locals.storageBaseUrl = resolvePublicBaseUrl("docs", {
  app: PORT,
  docs: DOCS_PORT,
});

// Middleware
app.use(corsMiddleware);
app.use(express.json());
app.use(morgan("dev"));

// Cek API root
app.get("/", (req, res) => {
  res.json({ message: "Welcome to the Rimba!" });
});

app.get("/debug/urls", (req, res) => {
  res.json({
    PG_ENV: process.env.PG_ENV,
    baseUrl: app.locals.baseUrl,
    storageBaseUrl: app.locals.storageBaseUrl,
  });
});

// Auth
app.use("/api", authRoutes);
app.use("/api/profile", profileRoutes);

// Public Request
app.use("/api/public-request", publicRequestRoute);
app.use("/api/kmis/public-request", kmispublicRequestRoute);
app.use("/api/cms/public-request", cmspublicRequestRoute);

//! ======== CMS MODULE ========
// CMS Content
app.use("/api/cms/content", contentRoutes);

// CMS News
app.use("/api/cms/news", newsRoutes);

// CMS Event
app.use("/api/cms/event", eventRoutes);

// CMS Animal Composition
app.use("/api/cms/animal-composition", animalCompositionRoutes);

// CMS Legal Document
app.use("/api/cms/legal-document", legalDocumentRoutes);

// CMS FAQ
app.use("/api/cms/faq", faqRoutes);
//! ======== CMS MODULE ========

//! ======== KMIS MODULE ========
// KMIS Dashboard
app.use("/api/kmis/dashboard", dashboardRoutes);

// KMIS Category
app.use("/api/kmis/category", categoryRoutes);

// KMIS Topic
app.use("/api/kmis/topic", topicRoutes);

// KMIS Educator
app.use("/api/kmis/educator", educatorRoutes);

// KMIS Student
app.use("/api/kmis/student", studentRoutes);

// KMIS Material
app.use("/api/kmis/material", materialRoutes);

// KMIS Quiz
app.use("/api/kmis/quiz", quizRoutes);

// KMIS Learning Participant
app.use("/api/kmis/learning-participant", learningParticipantRoutes);

//? Student Area
// KMIS Learning Course
app.use("/api/kmis/learning-course", learningAttemptRoutes);

// KMIS Exam
app.use("/api/kmis/exam", quizAttemptRoutes);
//? Student Area
//! ======== KMIS MODULE ========

//! ======== MONEV MODULE ========
// MONEV User
app.use("/api/monev/user", monevUserRoutes);

// MONEV Activity Package
app.use("/api/monev/activity-package", activityPackageRoutes);

// MONEV Target
app.use("/api/monev/target", targetRoutes);

// MONEV Monthly Realization
app.use("/api/monev/monthly-realization", monthlyRealizationRoutes);

// MONEV Activity Calendar
app.use("/api/monev/activity-calendar", activityCalendarRoutes);

// MONEV Share Report
app.use("/api/monev/share-report", shareReportRoutes);
//! ======== MONEV MODULE ========

//! ======== MASTER DATA MODULE ========
// MASTER DATA News Category
app.use("/api/master-data/news-category", newsCategoryRoutes);

// MASTER DATA Legal Document Category
app.use("/api/master-data/legal-docs-category", legalDocsCategoryRoutes);

// MASTER DATA Event Category
app.use("/api/master-data/event-category", eventCategoryRoutes);

// MASTER DATA Animal Category
app.use("/api/master-data/animal-category", animalCategoryRoutes);

// MASTER DATA Activity Category
app.use("/api/master-data/activity-category", activityCategoryRoutes);

// MASTER DATA PIC Division
app.use("/api/master-data/pic-division", picDivisionRoutes);

// MASTER DATA Monev Dashboard Management
app.use("/api/master-data/monev-dashboard", monevDashboardRoutes);
//! ======== MASTER DATA MODULE ========

// Jalankan server
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
