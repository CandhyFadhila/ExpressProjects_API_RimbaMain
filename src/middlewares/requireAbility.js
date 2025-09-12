const WithoutDataResource = require("../resources/WithoutDataResource");
const logger = require("../utils/logger");

function hasAbility(req, ability) {
  return (
    Array.isArray(req.auth?.abilities) && req.auth.abilities.includes(ability)
  );
}

function getAbility(req, opts = {}) {
  try {
    const abilities = Array.isArray(req.auth?.abilities)
      ? req.auth.abilities
      : [];
    const priority = Array.isArray(opts.priority) ? opts.priority : [];

    if (abilities.length === 0) return null;

    if (priority.length > 0) {
      for (const a of priority) {
        if (abilities.includes(a)) return a;
      }
    }
    return abilities[0] || null;
  } catch (err) {
    logger.error(`| Get Ability | - Error: ${err.message}`);
    const response = new WithoutDataResource(
      500,
      "SERVER_ERROR",
      "Server Sedang Error",
      "Terjadi kesalahan pada sistem, silahkan coba lagi nanti atau hubungi admin."
    );
    res.status(500).json(response.toResponse());
  }
}

function requireAbility(requiredAbility) {
  return (req, res, next) => {
    try {
      const auth = req.auth; // diasumsikan di-set oleh authMiddleware
      if (!auth || !Array.isArray(auth.abilities)) {
        logger.error(
          "| Require Ability | - Authorization or abilities data not found."
        );
        const response = new WithoutDataResource(
          401,
          "UNAUTHORIZED",
          "Akses Ditolak",
          "Token tidak valid atau tidak memiliki ability."
        );
        return res.status(401).json(response.toResponse());
      }
      if (!hasAbility(req, requiredAbility)) {
        logger.error(
          "| Require Ability | - User does not have required ability."
        );
        const response = new WithoutDataResource(
          403,
          "FORBIDDEN_ABILITY",
          "Akses Ditolak",
          "Anda tidak memiliki hak akses untuk endpoint ini."
        );
        return res.status(403).json(response.toResponse());
      }
      next();
    } catch (err) {
      logger.error(`| Require Ability | - Error: ${err.message}`);
      const response = new WithoutDataResource(
        500,
        "SERVER_ERROR",
        "Server Sedang Error",
        "Terjadi kesalahan pada sistem, silahkan coba lagi nanti atau hubungi admin."
      );
      res.status(500).json(response.toResponse());
    }
  };
}

function requireAnyAbility(abilities = []) {
  return (req, res, next) => {
    try {
      if (!Array.isArray(req.auth?.abilities)) {
        const r = new WithoutDataResource(
          401,
          "UNAUTHORIZED",
          "Akses Ditolak",
          "Token tidak valid atau tidak memiliki ability."
        );
        return res.status(401).json(r.toResponse());
      }
      const ok = abilities.some((a) => hasAbility(req, a));
      if (!ok) {
        const r = new WithoutDataResource(
          403,
          "FORBIDDEN_ABILITY",
          "Akses Ditolak",
          "Anda tidak memiliki hak akses untuk endpoint ini."
        );
        return res.status(403).json(r.toResponse());
      }
      next();
    } catch (err) {
      logger.error(`| Require Any Ability | - Error: ${err.message}`);
      const response = new WithoutDataResource(
        500,
        "SERVER_ERROR",
        "Server Sedang Error",
        "Terjadi kesalahan pada sistem, silahkan coba lagi nanti atau hubungi admin."
      );
      res.status(500).json(response.toResponse());
    }
  };
}

function requireAllAbilities(abilities = []) {
  return (req, res, next) => {
    try {
      if (!Array.isArray(req.auth?.abilities)) {
        const r = new WithoutDataResource(
          401,
          "UNAUTHORIZED",
          "Akses Ditolak",
          "Token tidak valid atau tidak memiliki ability."
        );
        return res.status(401).json(r.toResponse());
      }
      const ok = abilities.every((a) => hasAbility(req, a));
      if (!ok) {
        const r = new WithoutDataResource(
          403,
          "FORBIDDEN_ABILITY",
          "Akses Ditolak",
          "Anda tidak memiliki hak akses untuk endpoint ini."
        );
        return res.status(403).json(r.toResponse());
      }
      next();
    } catch (err) {
      logger.error(`| Require All Ability | - Error: ${err.message}`);
      const response = new WithoutDataResource(
        500,
        "SERVER_ERROR",
        "Server Sedang Error",
        "Terjadi kesalahan pada sistem, silahkan coba lagi nanti atau hubungi admin."
      );
      res.status(500).json(response.toResponse());
    }
  };
}

module.exports = requireAbility;
module.exports.hasAbility = hasAbility;
module.exports.getAbility = getAbility;
module.exports.requireAnyAbility = requireAnyAbility;
module.exports.requireAllAbilities = requireAllAbilities;
