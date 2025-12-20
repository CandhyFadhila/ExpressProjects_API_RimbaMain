const jwt = require("jsonwebtoken");
const WithoutDataResource = require("../resources/WithoutDataResource");
const {
  isTokenBlacklisted,
  blacklistToken,
} = require("../utils/tokenBlacklist");
const logger = require("../utils/logger");
const knex = require("../config/database");

const JWT_SECRET = (process.env.JWT_SECRET_KEY || "").trim();
if (!JWT_SECRET) {
  throw new Error('ENV wajib "JWT_SECRET_KEY" belum diisi.');
}

/**
 * authMiddleware
 * Wajib auth. Jika token tidak ada/invalid → 401.
 */
const authMiddleware = async (req, res, next) => {
  const token = req.header("Authorization")?.replace("Bearer ", "");

  if (!token) {
    const response = new WithoutDataResource(
      401,
      "TOKEN_NOT_FOUND",
      "Akses ditolak",
      "Token tidak ditemukan. Pastikan Anda sudah login dan menyertakan token dalam header request."
    );
    logger.info(
      `| Auth | - Token tidak ditemukan di request, at ${new Date().toISOString()}`
    );
    return res.status(401).json(response.toResponse());
  }

  const blacklisted = await isTokenBlacklisted(token);
  if (blacklisted) {
    const response = new WithoutDataResource(
      401,
      "TOKEN_BLACKLISTED",
      "Akses ditolak",
      "Sesi login Anda telah berakhir. Silakan login kembali."
    );
    return res.status(401).json(response.toResponse());
  }

  jwt.verify(token, JWT_SECRET, async (err, decoded) => {
    if (err && err.name === "TokenExpiredError") {
      const response = new WithoutDataResource(
        401,
        "TOKEN_EXPIRED",
        "Akses ditolak",
        "Token sudah kedaluwarsa. Silakan login kembali."
      );
      logger.info(`| Auth | - Token expired, at ${new Date().toISOString()}`);
      return res.status(401).json(response.toResponse());
    }

    if (err) {
      const response = new WithoutDataResource(
        401,
        "INVALID_TOKEN",
        "Akses ditolak",
        "Token tidak valid. Silakan login kembali."
      );
      logger.info(`| Auth | - Invalid token, at ${new Date().toISOString()}`);
      return res.status(401).json(response.toResponse());
    }

    const userId = decoded.userId;
    req.userId = userId;
    req.auth = {
      userId,
      roleName: decoded.role || null,
      abilities: Array.isArray(decoded.abilities) ? decoded.abilities : [],
      ctx: decoded.ctx || null,
    };

    try {
      const user = await knex("users").where({ id: userId }).first();
      if (!user || !user.last_login) {
        const response = new WithoutDataResource(
          401,
          "USER_NOT_FOUND_OR_NOT_LOGGED_IN",
          "Akses ditolak",
          "Pengguna tidak ditemukan atau belum login."
        );
        return res.status(401).json(response.toResponse());
      }

      const lastLogin = new Date(user.last_login);
      const now = new Date();
      const diffInDays = Math.floor((now - lastLogin) / (1000 * 60 * 60 * 24));

      if (diffInDays > 3) {
        await blacklistToken(token, 86400);

        const response = new WithoutDataResource(
          401,
          "LOGIN_EXPIRED",
          "Akses ditolak",
          "Anda belum login dalam 3 hari terakhir. Silakan login kembali."
        );
        logger.info(`| Auth | - Token valid tapi user idle > 3 hari`);
        return res.status(401).json(response.toResponse());
      }

      logger.info(
        `| Auth | - Token valid for userId: ${
          decoded.userId
        }, at ${new Date().toISOString()}`
      );
      return next();
    } catch (error) {
      logger.error(`| Auth | - Gagal mengecek last_login: ${error.message}`);
      const response = new WithoutDataResource(
        500,
        "SERVER_ERROR",
        "Server Sedang Error",
        "Terjadi kesalahan pada sistem, silahkan coba lagi nanti atau hubungi admin."
      );
      return res.status(500).json(response.toResponse());
    }
  });
};

/**
 * authOptionalMiddleware
 * Optional auth. Tidak memblok jika token tidak ada/invalid/expired/blacklisted.
 * Jika token valid → set req.userId & req.auth (sama seperti authMiddleware).
 */
const authOptionalMiddleware = async (req, res, next) => {
  const token = req.header("Authorization")?.replace("Bearer ", "");

  if (!token) return next();

  try {
    const blacklisted = await isTokenBlacklisted(token);
    if (blacklisted) return next();

    const decoded = jwt.verify(token, JWT_SECRET);
    const userId = decoded.userId;

    req.userId = userId;
    req.auth = {
      userId,
      roleName: decoded.role || null,
      abilities: Array.isArray(decoded.abilities) ? decoded.abilities : [],
      ctx: decoded.ctx || null,
    };

    try {
      const user = await knex("users").where({ id: userId }).first();
      if (!user || !user.last_login) return next();

      const lastLogin = new Date(user.last_login);
      const now = new Date();
      const diffInDays = Math.floor((now - lastLogin) / (1000 * 60 * 60 * 24));

      if (diffInDays > 3) {
        await blacklistToken(token, 86400);
        return next();
      }

      return next();
    } catch (e) {
      logger.warn(`| Auth Optional | - Skip last_login check: ${e.message}`);
      return next();
    }
  } catch (e) {
    return next();
  }
};

module.exports = authMiddleware;
module.exports.authOptionalMiddleware = authOptionalMiddleware;
