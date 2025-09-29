const express = require("express");
const router = express.Router();
const authController = require("../controllers/authController");
const { loginValidator } = require("../validators/loginValidator");
const { resetPasswordValidator } = require("../validators/resetPasswordValidator");
const { verifyOTPValidator } = require("../validators/verifyOTPValidator");
const { sendOTPValidator } = require("../validators/sendOTPValidator");
const { createAccountValidator } = require("../validators/createAccountValidator");
const validate = require("../middlewares/validate");
const authMiddleware = require("../middlewares/authMiddleware");
const rateLimiter = require("../middlewares/rateLimitMiddleware");
const requireAbility = require("../middlewares/requireAbility");

// 1) Super Admin SSO (tanpa forgot password routes)
router.post(
  "/sso/signin",
  rateLimiter,
  loginValidator,
  (req, res) => authController.signInAdminSSO(req, res)
);
router.get("/sso/user-info", rateLimiter, authMiddleware, requireAbility("super_admin"), authController.getUserInfo);
router.get("/sso/signout", rateLimiter, authMiddleware, requireAbility("super_admin"), authController.logout);

// 2) Educator
router.post(
  "/admin/signin",
  rateLimiter,
  loginValidator,
  (req, res) => authController.signInEducator(req, res)
);
// Reset Password via OTP
router.post("/admin/send-otp", rateLimiter, sendOTPValidator, validate, authController.sendOTP);
router.post("/admin/verify-otp", rateLimiter, verifyOTPValidator, validate, authController.verifyOTP);
router.post("/admin/reset-password", rateLimiter, resetPasswordValidator, validate, authController.resetPassword);
router.get("/admin/user-info", rateLimiter, authMiddleware, requireAbility("educator"), authController.getUserInfo);
router.get("/admin/signout", rateLimiter, authMiddleware, requireAbility("educator"), authController.logout);

// 3) Student
router.post(
  "/signin",
  rateLimiter,
  loginValidator,
  (req, res) => authController.signInStudent(req, res)
);
router.post(
  "/signup",
  rateLimiter,
  createAccountValidator,
  validate,
  authController.createAccount
);
router.post(
  "/oauth",
  rateLimiter,
  authController.createOrLoginWithOauth
);
// Reset Password via OTP
router.post("/send-otp", rateLimiter, sendOTPValidator, validate, authController.sendOTP);
router.post("/verify-otp", rateLimiter, verifyOTPValidator, validate, authController.verifyOTP);
router.post("/reset-password", rateLimiter, resetPasswordValidator, validate, authController.resetPassword);
router.get("/user-info", rateLimiter, authMiddleware, requireAbility("student"), authController.getUserInfo);
router.get("/signout", rateLimiter, authMiddleware, requireAbility("student"), authController.logout);

module.exports = router;
