const { validationResult } = require("express-validator");
const bcrypt = require("bcryptjs");
const knex = require("../../config/database");
const logger = require("../../utils/logger");
const nodemailer = require("nodemailer");
const {
  applySearch,
  applyPagination,
  formatPaginationResult,
} = require("../../helpers/queryHelper");
const { normIdArray } = require("../../helpers/inputNorm");
const WithDataResource = require("../../resources/WithDataResource");
const WithoutDataResource = require("../../resources/WithoutDataResource");
const renderEmailTemplate = require("../../utils/emailOTP/renderEmailTemplate");
const monevUserResource = require("../../resources/monev/monevUserResource");
const UserResource = require("../../resources/auth/UserResource");
const activityLogHelper = require("../../helpers/activityLogHelper");
const {
  stripTitlesOnly,
  generateRandomPassword,
} = require("../../helpers/credentialHelper");
const { checkEmailDeliverability } = require("../../helpers/emailValidChecker");
const { applyTrashedScope } = require("../../helpers/roleAbilityCheckHelper");

exports.getAllUserSso = async (req, res) => {
  const { search } = req.query;

  try {
    let query = knex("users as user")
      .select([
        "user.id",
        "user.name",
        "user.email",
        "user.role_id",
        "user.photo_profile_ids",
      ])
      .whereNot("user.id", 1)
      .where("user.account_status", 2)
      .where("user.role_id", 1)
      .leftJoin("roles as role", "user.role_id", "role.id")
      .whereNull("user.deleted_at")
      .orderBy("user.created_at", "desc");

    applySearch(query, search, ["user.name", "user.email"]);

    const paginationInfo = applyPagination(req.query);

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
      result.data.map((user) => UserResource(user))
    );

    const response = new WithDataResource(
      200,
      "SUCCESS_GET_DATA",
      "Berhasil Mengambil Data",
      "Data SSO berhasil diambil.",
      {
        data: serializedData,
        pagination: result.pagination,
      }
    );
    return res.status(200).json(response.toResponse());
  } catch (error) {
    logger.error(
      `| Account MONEV | - Error function getAllUserSso : ${error.message}`
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

exports.index = async (req, res) => {
  const { search } = req.query;

  try {
    let query = knex("users as user")
      .leftJoin("roles as role", "user.role_id", "role.id")
      .where("user.role_id", 3)
      .select("user.*")
      .orderBy("user.created_at", "desc");

    applyTrashedScope(query, req, "user.deleted_at");

    applySearch(query, search, ["user.name", "user.email"]);

    const paginationInfo = applyPagination(req.query);

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
      result.data.map((user) => monevUserResource(user))
    );

    const response = new WithDataResource(
      200,
      "SUCCESS_GET_DATA",
      "Berhasil Mengambil Data",
      "Data akun monev berhasil diambil.",
      {
        data: serializedData,
        pagination: result.pagination,
      }
    );
    return res.status(200).json(response.toResponse());
  } catch (error) {
    logger.error(`| Account MONEV | - Error function index : ${error.message}`);
    const response = new WithoutDataResource(
      500,
      "SERVER_ERROR",
      "Server Sedang Error",
      "Terjadi kesalahan pada sistem, silakan coba lagi nanti atau hubungi admin."
    );
    return res.status(500).json(response.toResponse());
  }
};

exports.store = async (req, res) => {
  const trx = await knex.transaction();
  const { name, email } = req.body;

  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const message = errors
        .array()
        .map((err) => err.msg)
        .join(" ");
      const response = new WithoutDataResource(
        422,
        "FAILED_VALIDATION",
        "Format Data Tidak Sesuai Ketentuan",
        message
      );
      return res.status(422).json(response.toResponse());
    }

    const probe = await checkEmailDeliverability(email, {
      useSmtp: true,
      strict: false, // penting: hindari false negative dari TEMP/UNAVAILABLE
      timeoutMs: 7000,
      maxMx: 3,
    });

    logger.info(
      `| Account MONEV | - [email-check] ${email} -> ${probe.ok} (${
        probe.reason
      }) ${JSON.stringify(probe.detail || [])}`
    );

    if (!probe.ok) {
      const response = new WithoutDataResource(
        422,
        "EMAIL_NOT_DELIVERABLE",
        "Email Tidak Dapat Dikirim",
        `Alamat email '${email}' tampaknya tidak dapat menerima email. Gunakan email valid yang lain.`
      );
      return res.status(422).json(response.toResponse());
    }

    const exists = await trx("users")
      .whereRaw("lower(email) = lower(?)", [email])
      .whereNull("deleted_at")
      .first();
    if (exists) {
      const response = new WithoutDataResource(
        422,
        "DUPLICATE_EMAIL",
        "Duplikat Data",
        `Email '${email}' sudah digunakan oleh akun monev lain. Silakan gunakan email lain.`
      );
      return res.status(422).json(response.toResponse());
    }

    const displayName = stripTitlesOnly(name);
    const rawPassword = generateRandomPassword(8);
    const passwordHash = await bcrypt.hash(rawPassword, 12);

    const [created] = await trx("users")
      .insert({
        name,
        email,
        role_id: 3,
        account_status: 2,
        password: passwordHash,
      })
      .returning(["id", "name", "email", "created_at"]);

    await activityLogHelper.logCreate(
      {
        userId: activityLogHelper.fromReq(req),
        module: "monev",
        subject: "Akun Monev Non PIC",
      },
      trx
    );

    await trx.commit();

    const transporter = nodemailer.createTransport({
      service: "Gmail",
      auth: {
        user: process.env.MAIL_USERNAME,
        pass: process.env.MAIL_PASSWORD,
      },
    });

    const htmlBody = renderEmailTemplate("credential_monev.html", {
      name: displayName,
      email: created.email,
      password: rawPassword,
      login_url: process.env.APP_LOGIN_URL || "#",
      from_email: process.env.MAIL_USERNAME,
      year: new Date().getFullYear(),
    });

    await transporter.sendMail({
      from: `"Rimba" <${process.env.MAIL_USERNAME}>`,
      to: created.email,
      subject: "Credential Akun Monev Non PIC",
      html: htmlBody,
    });

    logger.info(
      `| Account MONEV | - Credential email successfully sent to ${
        created.email
      } at ${new Date().toISOString()}`
    );

    const response = new WithoutDataResource(
      201,
      "SUCCESS_CREATE_DATA",
      "Berhasil Menyimpan Data",
      `Data akun monev dengan email '${email}' berhasil ditambahkan.`
    );
    return res.status(201).json(response.toResponse());
  } catch (error) {
    await trx.rollback();
    logger.error(`| Account MONEV | - Error function store: ${error.message}`);
    const response = new WithoutDataResource(
      500,
      "SERVER_ERROR",
      "Server Sedang Error",
      "Terjadi kesalahan pada sistem, silahkan coba lagi nanti atau hubungi admin."
    );
    res.status(500).json(response.toResponse());
  }
};

exports.show = async (req, res) => {
  const { id } = req.params;

  try {
    const user = await knex("users")
      .select("*")
      .where("id", id)
      .where("role_id", 3)
      .first();
    if (!user) {
      const response = new WithoutDataResource(
        200,
        "DATA_NOT_FOUND",
        "Data Tidak Ditemukan",
        `Data akun monev dengan ID '${id}' tidak ditemukan.`
      );
      return res.status(200).json(response.toResponse());
    }

    const data = await monevUserResource(user);
    const displayName = stripTitlesOnly(user.name);
    const response = new WithDataResource(
      200,
      "SUCCESS_GET_DATA",
      "Berhasil Mengambil Data",
      `Detail data akun monev '${displayName}' berhasil didapatkan.`,
      data
    );
    return res.status(200).json(response.toResponse());
  } catch (error) {
    logger.error(`| Account MONEV | - Error function show: ${error.message}`);
    const response = new WithoutDataResource(
      500,
      "SERVER_ERROR",
      "Server Sedang Error",
      "Terjadi kesalahan pada sistem, silahkan coba lagi nanti atau hubungi admin."
    );
    res.status(500).json(response.toResponse());
  }
};

exports.deactivateAccount = async (req, res) => {
  const trx = await knex.transaction();

  try {
    const ids = normIdArray(req.body?.deactivateAccountIds, {
      as: "number",
    }).filter(Number.isFinite);
    if (ids.length === 0) {
      await trx.rollback();
      const response = new WithoutDataResource(
        422,
        "INVALID_INPUT",
        "Gagal Menghapus Data",
        "Mohon kirimkan deactivateAccountIds berupa array ID numerik, misal: [1,2,3]."
      );
      return res.status(422).json(response.toResponse());
    }

    const MAX_BULK = 50;
    if (ids.length > MAX_BULK) {
      await trx.rollback();
      const response = new WithoutDataResource(
        422,
        "TOO_MANY_IDS",
        "Terlalu Banyak Data",
        `Maksimal id yang bisa dihapus adalah ${MAX_BULK} ID.`
      );
      return res.status(422).json(response.toResponse());
    }

    const alreadyInactive = await trx("users")
      .whereIn("id", ids)
      .where("role_id", 3)
      .where("account_status", 3)
      .select("id", "name");
    if (alreadyInactive.length > 0) {
      await trx.rollback();
      const list = alreadyInactive
        .slice(0, 5)
        .map((u) => `'${u.name}' (ID: ${u.id})`)
        .join(", ");
      const extra =
        alreadyInactive.length > 5
          ? `, dan ${alreadyInactive.length - 5} lainnya`
          : "";

      const response = new WithoutDataResource(
        409,
        "ACCOUNT_ALREADY_INACTIVE",
        "Akun Sudah Nonaktif",
        `Terdapat ${alreadyInactive.length} akun monev yang sudah nonaktif: ${list}${extra}. Operasi dibatalkan.`
      );
      return res.status(409).json(response.toResponse());
    }

    // Ambil kandidat yang valid untuk dinonaktifkan
    const candidates = await trx("users")
      .select("id", "email")
      .whereIn("id", ids)
      .where("role_id", 3)
      .whereNull("deleted_at")
      .whereNot("account_status", 3);
    if (candidates.length === 0) {
      await trx.rollback();
      const response = new WithoutDataResource(
        200,
        "DATA_NOT_FOUND",
        "Data Tidak Ditemukan",
        "Tidak ada akun monev yang cocok untuk dinonaktifkan atau akun sudah nonaktif/terhapus."
      );
      return res.status(200).json(response.toResponse());
    }

    const idsToDeactivate = candidates.map((r) => r.id);

    await trx("users").whereIn("id", idsToDeactivate).update({
      account_status: 3,
      deactivate_at: trx.fn.now(),
      updated_at: trx.fn.now(),
    });

    await activityLogHelper.logUpdate(
      {
        userId: activityLogHelper.fromReq(req),
        module: "monev",
        subject: "Akun Monev Non PIC",
      },
      trx
    );

    await trx.commit();

    const skipped = ids.length - idsToDeactivate.length;

    const parts = [
      `Berhasil menonaktifkan ${idsToDeactivate.length} akun monev.`,
    ];
    if (skipped > 0) {
      parts.push(
        `Terlewat ${skipped} data, karena sudah nonaktif atau telah dihapus.`
      );
    }

    const response = new WithoutDataResource(
      200,
      "SUCCESS_DEACTIVATE_ACCOUNT",
      "Berhasil Nonaktifkan Akun",
      parts.join(" ")
    );
    return res.status(200).json(response.toResponse());
  } catch (error) {
    await trx.rollback();
    logger.error(
      `| Account MONEV | - Error function deactivateAccount : ${error.message}`
    );
    const response = new WithoutDataResource(
      500,
      "SERVER_ERROR",
      "Server Sedang Error",
      "Terjadi kesalahan pada sistem. Silakan coba lagi nanti."
    );
    return res.status(500).json(response.toResponse());
  }
};

exports.activateAccount = async (req, res) => {
  const trx = await knex.transaction();

  try {
    const ids = normIdArray(req.body?.activateAccountIds, {
      as: "number",
    }).filter(Number.isFinite);
    if (ids.length === 0) {
      await trx.rollback();
      const response = new WithoutDataResource(
        422,
        "INVALID_INPUT",
        "Gagal Menghapus Data",
        "Mohon kirimkan activateAccountIds berupa array ID numerik, misal: [1,2,3]."
      );
      return res.status(422).json(response.toResponse());
    }

    const MAX_BULK = 50;
    if (ids.length > MAX_BULK) {
      await trx.rollback();
      const response = new WithoutDataResource(
        422,
        "TOO_MANY_IDS",
        "Terlalu Banyak Data",
        `Maksimal id yang bisa dihapus adalah ${MAX_BULK} ID.`
      );
      return res.status(422).json(response.toResponse());
    }

    const alreadyActive = await trx("users")
      .whereIn("id", ids)
      .where("role_id", 3)
      .where("account_status", 2)
      .select("id", "name");
    if (alreadyActive.length > 0) {
      await trx.rollback();
      const list = alreadyActive
        .slice(0, 5)
        .map((u) => `'${u.name}' (ID: ${u.id})`)
        .join(", ");
      const extra =
        alreadyActive.length > 5
          ? `, dan ${alreadyActive.length - 5} lainnya`
          : "";

      const response = new WithoutDataResource(
        409,
        "ACCOUNT_ALREADY_ACTIVE",
        "Akun Sudah Aktif",
        `Terdapat ${alreadyActive.length} akun monev yang sudah aktif: ${list}${extra}. Operasi dibatalkan.`
      );
      return res.status(409).json(response.toResponse());
    }

    const candidates = await trx("users")
      .select("id")
      .whereIn("id", ids)
      .where("role_id", 3)
      .whereNull("deleted_at")
      .whereNot("account_status", 2);
    if (candidates.length === 0) {
      await trx.rollback();
      const response = new WithoutDataResource(
        200,
        "DATA_NOT_FOUND",
        "Data Tidak Ditemukan",
        "Tidak ada akun monev yang cocok untuk diaktifkan atau akun sudah aktif/terhapus."
      );
      return res.status(200).json(response.toResponse());
    }

    const idsToActivate = candidates.map((r) => r.id);

    await trx("users").whereIn("id", idsToActivate).update({
      account_status: 2,
      deactivate_at: null,
      updated_at: trx.fn.now(),
    });

    await activityLogHelper.logUpdate(
      {
        userId: activityLogHelper.fromReq(req),
        module: "monev",
        subject: "Akun Monev Non PIC",
      },
      trx
    );

    await trx.commit();

    const skipped = ids.length - idsToActivate.length;
    const parts = [`Berhasil mengaktifkan ${idsToActivate.length} akun monev.`];
    if (skipped > 0) {
      parts.push(
        `Terlewat ${skipped} karena sudah aktif, bukan educator, atau telah dihapus.`
      );
    }

    const response = new WithoutDataResource(
      200,
      "SUCCESS_ACTIVATE_ACCOUNT",
      "Berhasil Mengaktifkan Akun",
      parts.join(" ")
    );
    return res.status(200).json(response.toResponse());
  } catch (error) {
    logger.error(
      `| Account MONEV | - Error function activateAccount: ${error.message}`
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
