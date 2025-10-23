const express = require("express");
const router = express.Router();
const authController = require("../controllers/authController");
const { loginValidator } = require("../validators/loginValidator");
const {
  resetPasswordValidator,
} = require("../validators/resetPasswordValidator");
const { verifyOTPValidator } = require("../validators/verifyOTPValidator");
const { sendOTPValidator } = require("../validators/sendOTPValidator");
const {
  createAccountValidator,
} = require("../validators/createAccountValidator");
const validate = require("../middlewares/validate");
const authMiddleware = require("../middlewares/authMiddleware");
const rateLimiter = require("../middlewares/rateLimitMiddleware");
const multer = require("multer");
const upload = multer();

// 1) Super Admin SSO Only (tanpa forgot password routes)
router.post(
  "/sso/signin",
  rateLimiter,
  upload.none(),
  loginValidator,
  (req, res) => authController.signInAdminSSO(req, res)
);

// 2) Educator Only
router.post(
  "/admin/signin",
  rateLimiter,
  upload.none(),
  loginValidator,
  (req, res) => authController.signInEducator(req, res)
);

// 3) Monev Only
router.post(
  "/monev/signin",
  rateLimiter,
  upload.none(),
  loginValidator,
  (req, res) => authController.signInMonev(req, res)
);

// 4) Student Only
router.post(
  "/signin", 
  rateLimiter, 
  upload.none(), 
  loginValidator, 
  (req, res) => authController.signInStudent(req, res)
);

router.post(
  "/signup",
  rateLimiter,
  upload.none(),
  createAccountValidator,
  validate,
  authController.createAccount
);

router.post(
  "/oauth", 
  rateLimiter, 
  authController.createOrLoginWithOauth
);

// Universal Routes
router.post(
  "/send-otp",
  rateLimiter,
  upload.none(),
  sendOTPValidator,
  validate,
  authController.sendOTP
);

router.post(
  "/verify-otp",
  rateLimiter,
  upload.none(),
  verifyOTPValidator,
  validate,
  authController.verifyOTP
);

router.post(
  "/reset-password",
  rateLimiter,
  upload.none(),
  resetPasswordValidator,
  validate,
  authController.resetPassword
);

router.get("/signout", rateLimiter, authMiddleware, authController.logout);

module.exports = router;
