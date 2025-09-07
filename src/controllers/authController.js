const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const validator = require("validator");
const crypto = require("crypto");
const nodemailer = require("nodemailer");
const { blacklistToken } = require("../utils/tokenBlacklist");
const { validationResult } = require("express-validator");
const logger = require("../utils/logger");
const knex = require("../config/database");
const redisClient = require("../config/redisClient");
const WithDataResource = require("../resources/WithDataResource");
const WithoutDataResource = require("../resources/WithoutDataResource");
const { stripTitlesOnly } = require("../helpers/credentialHelper");
const renderEmailTemplate = require("../utils/emailOTP/renderEmailTemplate");
const userResource = require("../resources/auth/UserResource");
const dateHelper = require("../helpers/dateHelper");
const JWT_SECRET = process.env.JWT_SECRET_KEY || "secretkey";

// ========== LOGIN CONTROLLER ==========
exports.signInAdminSSO = (req, res) =>
  signInWithContext(req, res, {
    context: "super_admin",
    requiredRole: "Super Admin",
    ability: "super_admin",
  });

exports.signInEducator = (req, res) =>
  signInWithContext(req, res, {
    context: "educator",
    requiredRole: "Educator",
    ability: "educator",
  });

exports.signInStudent = (req, res) =>
  signInWithContext(req, res, {
    context: "student",
    requiredRole: "Student",
    ability: "student",
  });

// ========== GET USER INFO CONTROLLER ==========
exports.getUserInfo = async (req, res) => {
  const userId = req.userId;

  try {
    // Ambil data user dari database berdasarkan userId
    const user = await knex("users").where({ id: userId }).first();
    if (!user) {
      const response = new WithoutDataResource(
        401, // HTTP Status Code: Unauthorized
        "ACCOUNT_NOT_FOUND",
        "Akses Ditolak",
        "Maaf, akun pengguna terkait tidak ditemukan."
      );
      logger.info(`| GetUserInfo | - Account not found for userId: ${userId}`);
      return res.status(401).json(response.toResponse());
    }

    logger.info(
      `| GetUserInfo | - User info fetched for userId: ${userId}, at ${new Date().toISOString()}`
    );

    const serialized = await userResource(user);
    const response = new WithDataResource(
      200, // HTTP Status Code: OK
      "SUCCESS_GET_USER_INFO",
      "Berhasil Mendapatkan Data",
      `Data pengguna ${user.name}, berhasil didapatkan.`,
      { user: serialized }
    );
    res.status(200).json(response.toResponse());
  } catch (error) {
    logger.error(`| Auth | - Error function getUserInfo: ${error.message}`);
    const response = new WithoutDataResource(
      500, // HTTP Status Code: Internal Server Error
      "SERVER_ERROR",
      "Server Sedang Error",
      "Terjadi kesalahan pada sistem, silahkan coba lagi nanti atau hubungi admin."
    );
    res.status(500).json(response.toResponse());
  }
};

// ========== LOGOUT CONTROLLER ==========
exports.logout = async (req, res) => {
  const userId = req.userId; // Diperoleh dari middleware authMiddleware
  const token = req.header("Authorization")?.replace("Bearer ", "");

  try {
    // Pastikan userId tersedia
    if (!userId) {
      const response = new WithoutDataResource(
        401, // HTTP Status Code: Unauthorized
        "NO_ACTIVE_SESSION",
        "Logout Gagal",
        "Anda tidak memiliki sesi login yang aktif."
      );
      logger.info(`| Logout | - No active session for userId: ${userId}`);
      return res.status(401).json(response.toResponse());
    }

    // Ambil expiry token dari decode tanpa verify (karena sudah terverifikasi sebelumnya)
    const decoded = jwt.decode(token);
    const expiresIn = decoded.exp - Math.floor(Date.now() / 1000); // detik tersisa

    // Masukkan token ke blacklist Redis
    await blacklistToken(token, expiresIn);

    // Di sini kita hanya menunggu token dihapus di client-side (client akan menghapus token JWT mereka)
    logger.info(
      `| Logout | - Logout success for userId: ${userId}, at ${new Date().toISOString()}`
    );

    // Response sukses
    const response = new WithoutDataResource(
      200, // HTTP Status Code: OK
      "LOGOUT_SUCCESS",
      "Logout Berhasil",
      "Anda berhasil melakukan logout."
    );
    res.status(200).json(response.toResponse());
  } catch (error) {
    logger.error(`| Auth | - Error function logout: ${error.message}`);
    const response = new WithoutDataResource(
      500, // HTTP Status Code: Internal Server Error
      "SERVER_ERROR",
      "Server Sedang Error",
      "Terjadi kesalahan pada sistem, silahkan coba lagi nanti atau hubungi admin."
    );
    res.status(500).json(response.toResponse());
  }
};

// ========== SEND OTP CONTROLLER ==========
exports.sendOTP = async (req, res) => {
  const { email } = req.body;

  if (!email || !validator.isEmail(email)) {
    const response = new WithoutDataResource(
      400,
      "VALIDATION_FAILED",
      "Pengiriman OTP Gagal",
      "Email tidak valid atau kosong. Pastikan Anda mengisi email dengan benar."
    );
    return res.status(400).json(response.toResponse());
  }

  try {
    const user = await knex("users")
      .select("id", "name")
      .where({ email })
      .first();
    if (!user) {
      const response = new WithoutDataResource(
        200,
        "DATA_NOT_FOUND",
        "Akun Tidak Ditemukan",
        `Akun dengan email '${email}' tidak ditemukan.`
      );
      return res.status(200).json(response.toResponse());
    }

    const status = Number(user.account_status);
    if (status === 3) {
      const since = dateHelper.formatTanggalIndonesia(user.deactivate_at, 1);
      logger.info(
        `| Send OTP | - Account blocked: deactivated/suspended for email: ${email}, since: ${user.deactivate_at}`
      );
      const response = new WithoutDataResource(
        401,
        "ACCOUNT_DEACTIVATED",
        "Akun Nonaktif",
        `Kami mendeteksi bahwa akun Anda telah dinonaktifkan sejak ${since}, silakan hubungi admin untuk melakukan aktivasi kembali sebelum melakukan reset password.`
      );
      return res.status(401).json(response.toResponse());
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const key = `otp:${user.id}`;
    const hash = crypto.createHash("sha256").update(otp).digest("hex");

    await redisClient.setEx(key, 1800, hash); // expire in 30 minutes

    const transporter = nodemailer.createTransport({
      service: "Gmail",
      auth: {
        user: process.env.MAIL_USERNAME,
        pass: process.env.MAIL_PASSWORD,
      },
    });

    const displayName = stripTitlesOnly(user.name);
    const htmlBody = renderEmailTemplate("otp.html", {
      name: displayName,
      otp: otp,
      from_email: process.env.MAIL_USERNAME,
      year: new Date().getFullYear(),
    });

    await transporter.sendMail({
      from: `"Rimba" <${process.env.MAIL_USERNAME}>`,
      to: email,
      subject: "Verifikasi Kode OTP Perubahan Kata Sandi",
      html: htmlBody,
    });

    logger.info(
      `| Send OTP | - OTP sent to ${email} at ${new Date().toISOString()}`
    );

    const response = new WithoutDataResource(
      200,
      "OTP_SENT",
      "Berhasil Mengirim Kode OTP",
      "Kode OTP berhasil dikirim. Silakan cek email Anda."
    );
    return res.status(200).json(response.toResponse());
  } catch (error) {
    logger.error(`| Auth | - Error function sendOTP: ${error.message}`);
    const response = new WithoutDataResource(
      500,
      "SERVER_ERROR",
      "Server Sedang Error",
      "Terjadi kesalahan pada sistem, silahkan coba lagi nanti atau hubungi admin."
    );
    return res.status(500).json(response.toResponse());
  }
};

// ========== VERIFY OTP CONTROLLER ==========
exports.verifyOTP = async (req, res) => {
  const { email, otp } = req.body;

  try {
    const user = await knex("users")
      .select("id", "email")
      .where({ email })
      .first();
    if (!user) {
      const response = new WithoutDataResource(
        200,
        "DATA_NOT_FOUND",
        "Akun Tidak Ditemukan",
        `Akun dengan email '${email}' tidak ditemukan.`
      );
      return res.status(200).json(response.toResponse());
    }

    const key = `otp:${user.id}`;
    const storedHashedOtp = await redisClient.get(key);

    if (!storedHashedOtp) {
      logger.info(`| Verify OTP | - OTP not found for user ${email}`);
      const response = new WithoutDataResource(
        400,
        "DATA_NOT_FOUND",
        "OTP Tidak Ditemukan",
        "Kode OTP tidak ditemukan atau sudah kadaluarsa. Silakan kirim ulang OTP."
      );
      return res.status(400).json(response.toResponse());
    }

    const hash = crypto.createHash("sha256").update(String(otp)).digest("hex");

    if (hash !== storedHashedOtp) {
      logger.info(`| Verify OTP | - Incorrect OTP for user ${email}`);
      const response = new WithoutDataResource(
        400,
        "INVALID_OTP",
        "OTP Tidak Valid",
        "Kode OTP yang anda masukkan tidak sesuai."
      );
      return res.status(400).json(response.toResponse());
    }

    logger.info(`| Verify OTP | - Success for user ${email}`);

    const response = new WithoutDataResource(
      200,
      "OTP_VERIFIED",
      "OTP Berhasil Diverifikasi",
      "Kode OTP anda berhasil diverifikasi. Silakan lanjutkan reset password."
    );
    return res.status(200).json(response.toResponse());
  } catch (error) {
    logger.error(`| Auth | - Error function verifyOTP: ${error.message}`);
    const response = new WithoutDataResource(
      500,
      "SERVER_ERROR",
      "Server Sedang Error",
      "Terjadi kesalahan pada sistem, silahkan coba lagi nanti atau hubungi admin."
    );
    return res.status(500).json(response.toResponse());
  }
};

// ========== RESET PASSWORD CONTROLLER ==========
exports.resetPassword = async (req, res) => {
  const { email, otp, password } = req.body;

  try {
    // Cari user
    const user = await knex("users")
      .select("id", "email")
      .where({ email })
      .first();
    if (!user) {
      const response = new WithoutDataResource(
        200,
        "DATA_NOT_FOUND",
        "Akun Tidak Ditemukan",
        `Akun dengan email '${email}' tidak ditemukan.`
      );
      return res.status(200).json(response.toResponse());
    }

    const status = Number(user.account_status);
    if (status === 3) {
      const since = dateHelper.formatTanggalIndonesia(user.deactivate_at, 1);
      logger.info(
        `| Reset Password | - Account blocked: deactivated/suspended for email: ${email}, since: ${user.deactivate_at}`
      );
      const response = new WithoutDataResource(
        401,
        "ACCOUNT_DEACTIVATED",
        "Akun Nonaktif",
        `Kami mendeteksi bahwa akun Anda telah dinonaktifkan sejak ${since}, silakan hubungi admin untuk melakukan aktivasi kembali.`
      );
      return res.status(401).json(response.toResponse());
    }

    const key = `otp:${user.id}`;
    const storedHashedOtp = await redisClient.get(key);
    if (!storedHashedOtp) {
      const response = new WithoutDataResource(
        400,
        "OTP_NOT_FOUND",
        "OTP Tidak Ditemukan",
        "Kode OTP tidak ditemukan atau sudah kadaluarsa. Silakan kirim ulang OTP."
      );
      return res.status(400).json(response.toResponse());
    }

    const hashedInputOtp = crypto
      .createHash("sha256")
      .update(String(otp))
      .digest("hex");
    if (hashedInputOtp !== storedHashedOtp) {
      const response = new WithoutDataResource(
        401,
        "INVALID_OTP",
        "OTP Tidak Valid",
        "Kode OTP yang anda masukkan salah. Silakan coba lagi atau kirim ulang OTP."
      );
      return res.status(401).json(response.toResponse());
    }

    // Update password
    const hashedPassword = await bcrypt.hash(password, 10);
    const updatePayload = {
      password: hashedPassword,
      last_change_password: knex.fn.now(),
    };
    if (status === 1) {
      updatePayload.account_status = 2;
    }

    await knex("users").where({ id: user.id }).update(updatePayload);

    // Hapus OTP dari Redis
    await redisClient.del(key);

    logger.info(`| Reset Password | - Success for email: ${email}`);

    const response = new WithoutDataResource(
      200,
      "PASSWORD_RESET_SUCCESS",
      "Password Berhasil Diubah",
      "Password anda berhasil diubah. Silakan login menggunakan password baru anda."
    );
    return res.status(200).json(response.toResponse());
  } catch (error) {
    logger.error(`| Auth | - Error function resetPassword: ${error.message}`);
    const response = new WithoutDataResource(
      500,
      "SERVER_ERROR",
      "Server Sedang Error",
      "Terjadi kesalahan pada sistem, silahkan coba lagi nanti atau hubungi admin."
    );
    return res.status(500).json(response.toResponse());
  }
};

// 1. bikin token JWT dengan ability
function signToken({ userId, roleName, ability, context }) {
  const payload = {
    userId,
    role: roleName,
    abilities: [ability],
    ctx: context,
  };
  return jwt.sign(payload, JWT_SECRET);
}

// 2. ambil user + role name (1 query)
async function findUserByEmailWithRole(email) {
  return knex("users as u")
    .leftJoin("roles as r", "r.id", "u.role_id")
    .where("u.email", email)
    .whereNull("u.deleted_at")
    .select("u.*", "r.name as role_name", "r.id as role_id")
    .first();
}

async function signInWithContext(req, res, { context, requiredRole, ability }) {
  // Validasi input
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const response = new WithoutDataResource(
      400,
      "VALIDATION_FAILED",
      "Login Gagal.",
      "Tolong periksa kembali input anda. Pastikan email dan password terisi dengan benar."
    );
    return res.status(400).json(response.toResponse());
  }

  const { email, password } = req.body;

  try {
    // Ambil user + role
    const user = await findUserByEmailWithRole(email);
    if (!user) {
      logger.info(
        `| Login | - Invalid credentials for email: ${email}, at ${new Date().toISOString()}`
      );
      const response = new WithoutDataResource(
        400,
        "INVALID_CREDENTIALS",
        "Login Gagal.",
        "Password atau email yang anda masukkan tidak valid, silahkan periksa kembali dan pastikan akun anda sudah terdaftar."
      );
      return res.status(400).json(response.toResponse());
    }

    // Validasi status akun: 1 (nonaktif) dan 3 (suspended) -> TOLAK
    const status = Number(user.account_status);
    if (status === 1) {
      logger.info(
        `| Login | - Account blocked: not-activated for email: ${email}, created_at: ${user.created_at}`
      );
      const response = new WithoutDataResource(
        401,
        "ACCOUNT_RESET_REQUIRED",
        "Reset Password Diperlukan",
        "Akun Anda belum dapat digunakan karena masih memakai kata sandi default. Silakan lakukan reset password terlebih dahulu untuk mengaktifkan akun."
      );
      return res.status(401).json(response.toResponse());
    }
    if (status === 3) {
      const since = dateHelper.formatTanggalIndonesia(user.deactivate_at, 1);
      logger.info(
        `| Login | - Account blocked: deactivated/suspended for email: ${email}, deactivate_at: ${user.deactivate_at}`
      );
      const response = new WithoutDataResource(
        401,
        "ACCOUNT_DEACTIVATED",
        "Akun Nonaktif",
        `Kami mendeteksi bahwa akun Anda telah dinonaktifkan sejak ${since}, silakan hubungi admin untuk melakukan aktivasi kembali.`
      );
      return res.status(401).json(response.toResponse());
    }

    // Role check (STRICT): harus persis dengan requiredRole
    const roleName = user.role_name || null;
    if (roleName !== requiredRole) {
      logger.info(
        `| Login | - Forbidden role for email: ${email} on context: ${context} (has: ${roleName}, need: ${requiredRole})`
      );
      const response = new WithoutDataResource(
        403,
        "FORBIDDEN_ROLE",
        "Akses Ditolak",
        `Akun Anda tidak memiliki hak akses untuk konteks ${context}.`
      );
      return res.status(403).json(response.toResponse());
    }

    // Verifikasi password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      logger.info(
        `| Login | - Invalid credentials for email: ${email}, at ${new Date().toISOString()}`
      );
      const response = new WithoutDataResource(
        400,
        "INVALID_CREDENTIALS",
        "Login Gagal.",
        "Password atau email yang anda masukkan tidak valid, silahkan periksa kembali dan pastikan akun anda sudah terdaftar."
      );
      return res.status(400).json(response.toResponse());
    }

    // Update last_login
    const now = new Date();
    await knex("users").where({ id: user.id }).update({ last_login: now });

    // Buat token dengan ability spesifik
    const token = signToken({ userId: user.id, roleName, ability, context });

    // Serialize & ambil field minimal
    const serialized = await userResource({ ...user, last_login: now });
    const minimalUser = {
      id: serialized.id,
      role: serialized.role,
      photoProfile: serialized.photoProfile,
      name: serialized.name,
      email: serialized.email,
      accountStatus: serialized.accountStatus,
      lastLogin: serialized.lastLogin,
    };

    logger.info(
      `| Login | - Login success for email: ${email}, context=${context}, ability=${ability}, at ${now.toISOString()}`
    );

    const response = new WithDataResource(
      200,
      "LOGIN_SUCCESS",
      "Login Berhasil.",
      `Selamat datang ${user.name}, anda berhasil login.`,
      { token, user: minimalUser }
    );
    return res.status(200).json(response.toResponse());
  } catch (error) {
    logger.error(`| Auth | - Error signInWithContext: ${error.message}`, {
      stack: error.stack,
    });
    const response = new WithoutDataResource(
      500,
      "SERVER_ERROR",
      "Server Sedang Error",
      "Terjadi kesalahan pada sistem, silahkan coba lagi nanti atau hubungi admin."
    );
    return res.status(500).json(response.toResponse());
  }
}
