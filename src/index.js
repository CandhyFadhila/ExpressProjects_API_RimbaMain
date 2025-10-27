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
    // Cek koneksi berdasarkan environment (Linux/Windows)
    const env = process.env.PG_ENV || "windows";
    const database = require("./config/database"); // ini file database.js

    // Panggil query untuk cek waktu server database
    const result = await database.raw("SELECT NOW()");

    res.json({
      status: "success",
      message: `Koneksi database (${env}) berhasil.`,
      server_time: result.rows[0].now,
    });
  } catch (error) {
    logger.error("DB Connection Error:", error.message);
    res.status(500).json({
      status: "error",
      message:
        "Gagal terhubung ke database. Pastikan environment sudah benar dan database sudah dijalankan.",
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
// Content
app.use("/api/cms/content", contentRoutes);

// News
app.use("/api/cms/news", newsRoutes);

// Event
app.use("/api/cms/event", eventRoutes);

// Animal Composition
app.use("/api/cms/animal-composition", animalCompositionRoutes);

// Legal Document
app.use("/api/cms/legal-document", legalDocumentRoutes);

// FAQ
app.use("/api/cms/faq", faqRoutes);
//! ======== CMS MODULE ========

//! ======== KMIS MODULE ========
// Dashboard
app.use("/api/kmis/dashboard", dashboardRoutes);

// Category
app.use("/api/kmis/category", categoryRoutes);

// Topic
app.use("/api/kmis/topic", topicRoutes);

// Educator
app.use("/api/kmis/educator", educatorRoutes);

// Student
app.use("/api/kmis/student", studentRoutes);

// Material
app.use("/api/kmis/material", materialRoutes);

// Quiz
app.use("/api/kmis/quiz", quizRoutes);

// Learning Participant
app.use("/api/kmis/learning-participant", learningParticipantRoutes);

//? Student Area
// Learning Course
app.use("/api/kmis/learning-course", learningAttemptRoutes);

// Exam
app.use("/api/kmis/exam", quizAttemptRoutes);
//? Student Area
//! ======== KMIS MODULE ========

//! ======== MONEV MODULE ========
// Monev User
app.use("/api/monev/user", monevUserRoutes);


//! ======== MONEV MODULE ========

//! ======== MASTER DATA MODULE ========
// News Category
app.use("/api/master-data/news-category", newsCategoryRoutes);

// Event Category
app.use("/api/master-data/event-category", eventCategoryRoutes);

// Animal Category
app.use("/api/master-data/animal-category", animalCategoryRoutes);

// Activity Category
app.use("/api/master-data/activity-category", activityCategoryRoutes);

// PIC Division
app.use("/api/master-data/pic-division", picDivisionRoutes);

// Monev Dashboard Management
app.use("/api/master-data/monev-dashboard", monevDashboardRoutes);
//! ======== MASTER DATA MODULE ========

// Jalankan server
app.listen(PORT, () => {
  // Di windows akan log: http://localhost:4000
  // Di linux akan log:   https://rimbaexium.org
  console.log(`Server berjalan di ${app.locals.baseUrl} (listen port ${PORT})`);
});
