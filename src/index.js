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

const app = express();

// Middleware
app.use(corsMiddleware);
app.use(express.json());
app.use(morgan("dev"));

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
// TODO: section user info
// 1. get all activity logs user login
// 2. change photo profile
// 3. change password

// Public Request
app.use("/api/public-request", publicRequestRoute);

// KMIS
// Category
app.use("/api/kmis/category", categoryRoutes);

// Topic
app.use("/api/kmis/topic", topicRoutes);

// Educator
app.use("/api/kmis/educator", educatorRoutes);

// Jalankan server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server berjalan di http://localhost:${PORT}`);
});
