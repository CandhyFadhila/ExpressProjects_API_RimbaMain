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
// 1. get all activity logs user login, kalau yang login superadmin bisa lihat activity logs semua role, kalau yang login educator bisa lihat activity logs educator dia sendiri (id educator yang login) dan activity logs student. Contoh output ini
// {
//   [
//     {
//       role: "superadmin",
//       dataActivity: [
//         {
//           user; "superadmin1",
//           activity: [
//             {
//               activity: "login",
//             }
//           ],
//         },
//         {
//           user; "superadmin2",
//           activity: [
//             {
//               activity: "login",
//             }
//           ],
//         },
//       ],
//     },
//     {
//       role: "educator",
//       dataActivity: [
//         {
//           user; "educator1",
//           activity: [
//             {
//               activity: "login",
//             }
//           ],
//         },
//         {
//           user; "educator2",
//           activity: [
//             {
//               activity: "login",
//             }
//           ],
//         },
//       ],
//     },
//     {
//       role: "student",
//       dataActivity: [
//         {
//           user; "student1",
//           activity: [
//             {
//               activity: "login",
//             }
//           ],
//         },
//         {
//           user; "student2",
//           activity: [
//             {
//               activity: "login",
//             }
//           ],
//         },
//       ],
//     },
//   ];
// }
// 2. change photo profile
// 3. change password

app.use("/api/profile", profileRoutes);


// Public Request
app.use("/api/kmis/public-request", publicRequestRoute);

// KMIS
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

// Jalankan server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server berjalan di http://localhost:${PORT}`);
});
