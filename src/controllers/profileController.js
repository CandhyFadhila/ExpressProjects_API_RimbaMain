const { validationResult } = require("express-validator");
const knex = require("../config/database");
const bcrypt = require("bcryptjs");
const nodemailer = require("nodemailer");
const logger = require("../utils/logger");
const {
  toArray,
  normJsonbArray,
  normIdArray,
} = require("../helpers/inputNorm");
const {
  applySearch,
  applyPagination,
  formatPaginationResult,
} = require("../helpers/queryHelper");
const {
  stripTitlesOnly,
  makeInitialPasswordFromName,
} = require("../helpers/credentialHelper");
const { asJsonb } = require("../helpers/dbJson");
const documentHelper = require("../helpers/documentHelper");
const renderEmailTemplate = require("../utils/emailOTP/renderEmailTemplate");
const WithDataResource = require("../resources/WithDataResource");
const WithoutDataResource = require("../resources/WithoutDataResource");
const UserResource = require("../resources/auth/UserResource");
const activityLogResource = require("../resources/auth/activityLogResource");
const activityLogHelper = require("../helpers/activityLogHelper");

exports.getUserProfile = async (req, res) => {
  const userId =
    req.auth?.userId ??
    req.auth?.user_id ??
    req.auth?.id ??
    req.userId ??
    req.user?.id;

  try {
    const user = await knex("users")
      .select("*")
      .where("id", userId)
      .whereNull("deleted_at")
      .first();
    if (!user) {
      const response = new WithoutDataResource(
        200,
        "DATA_NOT_FOUND",
        "Data Tidak Ditemukan",
        `Data akun pengguna dengan ID '${id}' tidak ditemukan.`
      );
      return res.status(200).json(response.toResponse());
    }

    const displayName = stripTitlesOnly(user.name);
    const data = await UserResource(user);
    const response = new WithDataResource(
      200,
      "SUCCESS_GET_DATA",
      "Berhasil Mengambil Data",
      `Detail data akun pengguna '${displayName}' berhasil didapatkan.`,
      data
    );
    return res.status(200).json(response.toResponse());
  } catch (error) {
    logger.error(
      `| Profile | - Error function getUserProfile: ${error.message}`
    );
    const response = new WithoutDataResource(
      500,
      "SERVER_ERROR",
      "Server Sedang Error",
      "Terjadi kesalahan pada sistem, silahkan coba lagi nanti atau hubungi admin."
    );
    res.status(500).json(response.toResponse());
  }
};

exports.getUserActivitybyUserId = async (req, res) => {
  const { id } = req.params;
  const { search } = req.query;

  try {
    const user = await knex("users as user")
      .where("user.id", id)
      .whereNot("user.role_id", 1) // Skip super admin
      .whereNull("user.deleted_at")
      .first();
    if (!user) {
      const response = new WithoutDataResource(
        200,
        "DATA_NOT_FOUND",
        "Data Tidak Ditemukan",
        `Data akun pengguna dengan ID '${id}' tidak ditemukan.`
      );
      return res.status(200).json(response.toResponse());
    }

    let query = knex("activity_logs as activity")
      .leftJoin("users as user", "user.id", "activity.user_id") // agar bisa search nama user (opsional)
      .select("activity.*")
      .where("activity.user_id", user.id)
      .whereNull("activity.deleted_at")
      .orderBy("activity.created_at", "desc");

    applySearch(query, search, [
      "activity.module",
      "activity.key",
      "user.name",
    ]);

    const paginationInfo = applyPagination(query, req.query);

    const result = await formatPaginationResult(query, paginationInfo, knex);
    if (result.data.length === 0) {
      const response = new WithoutDataResource(
        200,
        "DATA_NOT_FOUND",
        "Data Tidak Ditemukan",
        "Tidak ada data yang sesuai dengan filter atau pencarian."
      );
      return res.status(200).json(response.toResponse());
    }

    const serializedData = await Promise.all(
      result.data.map((row) => activityLogResource(row, user))
    );

    const response = new WithDataResource(
      200,
      "SUCCESS_GET_DATA",
      "Berhasil Mengambil Data",
      "Data aktivitas pengguna berhasil diambil.",
      {
        data: serializedData,
        pagination: result.pagination,
      }
    );
    return res.status(200).json(response.toResponse());
  } catch (error) {
    logger.error(
      `| Profile | - Error function getUserActivitybyUserId: ${error.message}`
    );
    const response = new WithoutDataResource(
      500,
      "SERVER_ERROR",
      "Server Sedang Error",
      "Terjadi kesalahan pada sistem, silakan coba lagi nanti atau hubungi admin."
    );
    return res.status(500).json(response.toResponse());
  }
};

exports.updateUserData = async (req, res) => {
  const trx = await knex.transaction();
  const { name, email, birthDate, gender, phoneNumber, profession, address } =
    req.body;
  const userId =
    req.auth?.userId ??
    req.auth?.user_id ??
    req.auth?.id ??
    req.userId ??
    req.user?.id;
  const isProvided = (v) => {
    if (v == null) return false;
    const s = String(v).trim();
    if (!s) return false; // ""
    if (/^null$/i.test(s)) return false; // "null"
    if (/^undefined$/i.test(s)) return false; // "undefined"
    return true;
  };

  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const message = errors
        .array()
        .map((err) => err.msg)
        .join(" ");
      const response = new WithoutDataResource(
        400,
        "FAILED_VALIDATION",
        "Format Data Tidak Sesuai Ketentuan",
        message
      );
      return res.status(400).json(response.toResponse());
    }

    const existing = await trx("users")
      .where("id", userId)
      .whereNull("deleted_at")
      .first();
    if (!existing) {
      const response = new WithoutDataResource(
        200,
        "DATA_NOT_FOUND",
        "Data Tidak Ditemukan",
        `Data pengguna dengan ID '${userId}' tidak ditemukan.`
      );
      return res.status(200).json(response.toResponse());
    }

    // ---- Photo section ----
    const uploadedFile = req.file ?? req.files?.files?.[0] ?? null;

    const oldPhotoIds = normJsonbArray(existing.photo_profile_ids);
    const oldDocId = normIdArray(oldPhotoIds, { as: "number" })[0] ?? null;

    const hasOldPhoto = oldDocId != null;
    const hasNewUpload = !!uploadedFile;

    let newDocId = null;
    if (hasNewUpload) {
      const uploadedIds = await documentHelper.uploadDocuments(
        [uploadedFile],
        req
      );
      newDocId = uploadedIds?.[0] ?? null;
      if (newDocId == null) {
        throw new Error("UPLOAD_FAILED: tidak mendapatkan ID dokumen baru.");
      }
    }

    // ---- New Email section ----
    const normalizedExistingEmail = String(existing.email || "")
      .trim()
      .toLowerCase();
    const normalizedNewEmail = isProvided(email)
      ? String(email).trim().toLowerCase()
      : normalizedExistingEmail;

    const isEmailChanged =
      isProvided(email) && normalizedNewEmail !== normalizedExistingEmail;

    // Pakai nama yang benar-benar dikirim; kalau kosong, pakai nama lama
    const effectiveName = isProvided(name) ? name : existing.name;
    const displayName = stripTitlesOnly(effectiveName);

    // Jika email berubah → buat password baru & hash
    let rawPassword = null;
    let passwordHash = null;
    if (isEmailChanged) {
      rawPassword = makeInitialPasswordFromName(effectiveName);
      passwordHash = await bcrypt.hash(rawPassword, 12);
    }

    const payload = {
      updated_at: trx.fn.now(),
      ...(isEmailChanged && { password: passwordHash, account_status: 1 }),
      ...(hasNewUpload && { photo_profile_ids: asJsonb([Number(newDocId)]) }),

      ...(isProvided(name) && { name }),
      ...(isProvided(email) && { email }),
      ...(isProvided(birthDate) && {
        birth_date: knex.raw("left(?,10)::date", [birthDate]),
      }),
      ...(isProvided(gender) && { gender: Number(gender) }),
      ...(isProvided(phoneNumber) && { phone_number: phoneNumber }),
      ...(isProvided(profession) && { profession }),
      ...(isProvided(address) && { address }),
    };

    await trx("users").where("id", userId).update(payload);

    const roleRow = await trx("roles")
      .select("name")
      .where("id", existing.role_id)
      .first();
    const roleName = roleRow?.name ?? "User";

    await activityLogHelper.logUpdate(
      {
        userId: activityLogHelper.fromReq(req),
        module: "profile",
        subject: "Data Diri",
      },
      trx
    );

    await trx.commit();

    // Hapus foto lama hanya pada case REPLACE (ada foto lama & ada upload baru & ID berubah)
    if (hasOldPhoto && hasNewUpload && newDocId && newDocId !== oldDocId) {
      documentHelper.deleteDocuments([oldDocId]).catch((err) => {
        logger.warn(`Gagal hapus foto lama user ${userId}: ${err.message}`);
      });
    }

    if (isEmailChanged) {
      try {
        const finalEmail = email;

        const transporter = nodemailer.createTransport({
          service: "Gmail",
          auth: {
            user: process.env.MAIL_USERNAME,
            pass: process.env.MAIL_PASSWORD,
          },
        });

        const htmlBody = renderEmailTemplate("credential_new_email.html", {
          name: displayName,
          email: finalEmail,
          password: rawPassword,
          role_name: roleName,
          login_url: process.env.APP_LOGIN_URL || "#",
          from_email: process.env.MAIL_USERNAME,
          year: new Date().getFullYear(),
        });

        await transporter.sendMail({
          from: `"Rimba" <${process.env.MAIL_USERNAME}>`,
          to: finalEmail,
          subject: "Credential Akun Baru RIMBA",
          html: htmlBody,
        });

        logger.info(
          `| Student KMIS | - Credential email successfully sent to ${finalEmail} at ${new Date().toISOString()}`
        );
      } catch (mailErr) {
        logger.error(
          `| Profile | - Failed to send credential email: ${mailErr.message}`
        );
      }
    }

    const response = new WithoutDataResource(
      200,
      "SUCCESS_UPDATE_DATA",
      "Berhasil Memperbarui",
      `Data akun pengguna '${displayName}' berhasil diperbarui.`
    );
    return res.status(200).json(response.toResponse());
  } catch (error) {
    await trx.rollback();
    logger.error(`| Profile | - Error function update : ${error.message}`);
    const response = new WithoutDataResource(
      500,
      "SERVER_ERROR",
      "Server Sedang Error",
      "Terjadi kesalahan pada sistem. Silakan coba lagi nanti."
    );
    return res.status(500).json(response.toResponse());
  }
};
