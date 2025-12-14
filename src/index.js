require("dotenv").config();
const express = require("express");
const morgan = require("morgan");
const corsMiddleware = require("./middlewares/cors");
const logger = require("./utils/logger");
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

const app = express();

app.set('trust proxy', 1);

function isLinux() {
  return (
    String(process.env.PG_ENV || "windows")
      .trim()
      .toLowerCase() === "linux"
  );
}

function resolvePublicBaseUrl(port) {
  return isLinux() ? "https://rimbaexium.org" : `http://localhost:${port}`;
}

// Middleware
app.use(corsMiddleware);
app.use(express.json());
app.use(morgan("dev"));

if (isLinux()) {
  app.set("trust proxy", 1);
}

const PORT = 4000;
app.locals.baseUrl = resolvePublicBaseUrl(PORT);

// Cek API root
app.get("/", (req, res) => {
  res.json({ message: "Welcome to the Rimba!" });
});

// Cek db
app.get("/check-db", async (req, res) => {
  try {
    const [metaResult, tablesResult] = await Promise.all([
      knex.raw(`
        SELECT
          current_database() AS database,
          current_schema()   AS schema,
          current_user       AS "user",
          current_setting('port') AS port,
          NOW()              AS server_time
      `),
      knex.raw(`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = current_schema()
          AND table_type = 'BASE TABLE'
        ORDER BY table_name
      `),
    ]);

    const meta = metaResult.rows[0];
    const tables = tablesResult.rows.map((row) => row.table_name);

    res.json({
      status: "success",
      message: "Koneksi database berhasil.",
      database: meta.database,
      schema: meta.schema,
      user: meta.user,
      port: Number(meta.port),
      server_time: meta.server_time,
      tables_count: tables.length,
      tables,
    });
  } catch (error) {
    logger.error("DB Connection Error:", error.message);
    res.status(500).json({
      status: "error",
      message: "Gagal terhubung ke database.",
      error: error.message,
    });
  }
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
app.listen(PORT, () => {
  console.log(`Server berjalan di ${app.locals.baseUrl} (listen port ${PORT})`);
});
