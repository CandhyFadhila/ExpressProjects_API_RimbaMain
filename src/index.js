require("dotenv").config();
const express = require("express");
const morgan = require("morgan");
const knex = require("./config/database");
const corsMiddleware = require("./middlewares/cors");
const logger = require("./utils/logger");
const publicRequestRoute = require("./routes/publicRequest/publicRequestRoute");
const authRoutes = require("./routes/authRoutes");
const categoryRoutes = require("./routes/kmis/categoryRoutes");
const topicRoutes = require("./routes/kmis/topicRoutes");
const educatorRoutes = require("./routes/kmis/educatorRoutes");
const studentRoutes = require("./routes/kmis/studentRoutes");
const materialRoutes = require("./routes/kmis/materialRoutes");
const profileRoutes = require("./routes/profileRoutes");

const app = express();

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

const PORT = 3000;
app.locals.baseUrl = resolvePublicBaseUrl(PORT);

// Cek API root
app.get("/", (req, res) => {
  res.json({ message: "Welcome to the Rimba!" });
});

// Cek db
app.get("/check-db", async (req, res) => {
  try {
    const result = await knex.raw("SELECT NOW()");
    res.json({
      status: "success",
      message: "Koneksi database berhasil.",
      server_time: result.rows[0].now,
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
app.use("/api/kmis/public-request", publicRequestRoute);

//! ======== KMIS MODULE ========
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
//! ======== KMIS MODULE ========

// Jalankan server
app.listen(PORT, () => {
  // Di windows akan log: http://localhost:3000
  // Di linux akan log:   https://rimbaexium.org
  logger.info(`Server berjalan di ${app.locals.baseUrl} (listen port ${PORT})`);
  console.log(`Server berjalan di ${app.locals.baseUrl} (listen port ${PORT})`);
});
