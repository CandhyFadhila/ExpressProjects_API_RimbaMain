const WithoutDataResource = require("../resources/WithoutDataResource");
const logger = require("../utils/logger");

module.exports = function requireAbility(requiredAbility) {
  return (req, res, next) => {
    try {
      const auth = req.auth; // diasumsikan di-set oleh authMiddleware
      if (!auth || !auth.abilities || !Array.isArray(auth.abilities)) {
        logger.error("| Ability | - Authorization or abilities data not found.");
        const response = new WithoutDataResource(
          401,
          "UNAUTHORIZED",
          "Akses Ditolak",
          `Token tidak valid atau tidak memiliki ability.`
        );
        return res.status(401).json(response.toResponse());
      }

      if (!auth.abilities.includes(requiredAbility)) {
        logger.error("| Ability | - User does not have required ability.");
        const response = new WithoutDataResource(
          403,
          "FORBIDDEN_ABILITY",
          "Akses Ditolak",
          `Anda tidak memiliki hak akses untuk endpoint ini.`
        );
        return res.status(403).json(response.toResponse());
      }

      next();
    } catch (err) {
      logger.error(`| Ability | - Error: ${err.message}`);
      const response = new WithoutDataResource(
        500,
        "SERVER_ERROR",
        "Server Sedang Error",
        "Terjadi kesalahan pada sistem, silahkan coba lagi nanti atau hubungi admin."
      );
      res.status(500).json(response.toResponse());
    }
  };
};
