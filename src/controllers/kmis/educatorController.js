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
const WithDataResource = require("../../resources/WithDataResource");
const WithoutDataResource = require("../../resources/WithoutDataResource");
const renderEmailTemplate = require("../../utils/emailOTP/renderEmailTemplate");
const educatorResource = require("../../resources/kmis/educatorResource");
const activityLogHelper = require("../../helpers/activityLogHelper");
const {
  stripTitlesOnly,
  makeInitialPasswordFromName,
} = require("../../helpers/credentialHelper");
const { applyTrashedScope } = require("../../helpers/roleAbilityCheckHelper");

exports.index = async (req, res) => {
  const { search } = req.query;

  try {
    let query = knex("users as user")
      .leftJoin("roles as role", "user.role_id", "role.id")
      .where("user.role_id", 2)
      .select("user.*")
      .orderBy("user.created_at", "desc");

    applyTrashedScope(query, req, "user.deleted_at");

    applySearch(query, search, ["user.name", "role.name"]);

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

    // Ambil semua id user di halaman ini
    const ids = result.data.map((r) => r.id);

    // Hitung total material per user sekali saja
    const totals = await knex("kmis_materials")
      .whereIn("created_by", ids)
      .whereNull("deleted_at")
      .groupBy("created_by")
      .select("created_by")
      .count({ total: "*" });

    const totalMap = new Map(
      totals.map((t) => [Number(t.created_by), Number(t.total)])
    );

    const serializedData = await Promise.all(
      result.data.map((row) =>
        educatorResource({ ...row, total_material: totalMap.get(row.id) ?? 0 })
      )
    );

    const response = new WithDataResource(
      200,
      "SUCCESS_GET_DATA",
      "Berhasil Mengambil Data",
      "Data akun pengajar berhasil diambil.",
      {
        data: serializedData,
        pagination: result.pagination,
      }
    );
    return res.status(200).json(response.toResponse());
  } catch (error) {
    logger.error(`| Educator KMIS | - Error function index : ${error.message}`);
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
        400,
        "FAILED_VALIDATION",
        "Format Data Tidak Sesuai Ketentuan",
        message
      );
      return res.status(400).json(response.toResponse());
    }

    const exists = await trx("users")
      .whereRaw("lower(email) = lower(?)", [email])
      .whereNull("deleted_at")
      .first();
    if (exists) {
      const response = new WithoutDataResource(
        400,
        "DUPLICATE_EMAIL",
        "Duplikat Data",
        `Email '${email}' sudah digunakan oleh akun pengajar lain. Silakan gunakan email lain.`
      );
      return res.status(400).json(response.toResponse());
    }

    const displayName = stripTitlesOnly(name);
    const rawPassword = makeInitialPasswordFromName(name); // "{name-lowercase-tanpa-gelar}RIMBA2025"
    const passwordHash = await bcrypt.hash(rawPassword, 12);

    const [created] = await trx("users")
      .insert({
        name,
        email,
        role_id: 2,
        account_status: 1,
        password: passwordHash,
      })
      .returning(["id", "name", "email", "created_at"]);

    await activityLogHelper.logCreate(
      {
        userId: activityLogHelper.fromReq(req),
        module: "kmis",
        subject: "Akun Pengajar",
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

    const htmlBody = renderEmailTemplate("credential_educator.html", {
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
      subject: "Credential Akun Pengajar RIMBA",
      html: htmlBody,
    });

    logger.info(
      `| Educator KMIS | - Credential email sent to ${
        created.email
      } at ${new Date().toISOString()}`
    );

    const response = new WithoutDataResource(
      201,
      "SUCCESS_CREATE_DATA",
      "Berhasil Menyimpan Data",
      `Data akun pengajar dengan email '${email}' berhasil ditambahkan.`
    );
    return res.status(201).json(response.toResponse());
  } catch (error) {
    await trx.rollback();
    logger.error(`| Educator KMIS | - Error function store: ${error.message}`);
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
      .where("role_id", 2)
      .first();
    if (!user) {
      const response = new WithoutDataResource(
        200,
        "DATA_NOT_FOUND",
        "Data Tidak Ditemukan",
        `Data pengajar dengan ID '${id}' tidak ditemukan.`
      );
      return res.status(200).json(response.toResponse());
    }

    const data = await educatorResource(user);
    const displayName = stripTitlesOnly(user.name);
    const response = new WithDataResource(
      200,
      "SUCCESS_GET_DATA",
      "Berhasil Mengambil Data",
      `Detail data pengajar '${displayName}' berhasil didapatkan.`,
      data
    );
    return res.status(200).json(response.toResponse());
  } catch (error) {
    logger.error(`| Educator KMIS | - Error function show: ${error.message}`);
    const response = new WithoutDataResource(
      500,
      "SERVER_ERROR",
      "Server Sedang Error",
      "Terjadi kesalahan pada sistem, silahkan coba lagi nanti atau hubungi admin."
    );
    res.status(500).json(response.toResponse());
  }
};

exports.update = async (req, res) => {
  const trx = await knex.transaction();
  const { name, email } = req.body;
  const id = req.params.id;

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
      .where("id", id)
      .where("role_id", 2)
      .first();
    if (!existing) {
      const response = new WithoutDataResource(
        200,
        "DATA_NOT_FOUND",
        "Data Tidak Ditemukan",
        `Data pengajar dengan ID '${id}' tidak ditemukan.`
      );
      return res.status(200).json(response.toResponse());
    }

    const duplicate = await trx("users")
      .whereRaw("lower(email) = lower(?)", [email])
      .whereNull("deleted_at")
      .whereNot("id", id)
      .first();
    if (duplicate) {
      const response = new WithoutDataResource(
        400,
        "DUPLICATE_TITLE",
        "Duplikat Data",
        `Email '${email}' sudah digunakan pada pengguna lain.`
      );
      return res.status(400).json(response.toResponse());
    }

    await trx("users").where("id", id).update({
      name,
      email,
      updated_at: trx.fn.now(),
    });

    await activityLogHelper.logUpdate(
      {
        userId: activityLogHelper.fromReq(req),
        module: "kmis",
        subject: "Akun Pengajar",
      },
      trx
    );

    await trx.commit();

    const response = new WithoutDataResource(
      200,
      "SUCCESS_UPDATE_DATA",
      "Berhasil Memperbarui",
      `Data akun pengajar dengan email '${email}' berhasil diperbarui.`
    );
    return res.status(200).json(response.toResponse());
  } catch (error) {
    await trx.rollback();
    logger.error(
      `| Educator KMIS | - Error function update : ${error.message}`
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

exports.destroy = async (req, res) => {
  const trx = await knex.transaction();
  const id = req.params.id;

  try {
    const existing = await trx("users")
      .where("id", id)
      .where("role_id", 2)
      .first();
    if (!existing) {
      await trx.rollback();
      const response = new WithoutDataResource(
        200,
        "DATA_NOT_FOUND",
        "Data Tidak Ditemukan",
        `Akun pengajar dengan ID '${id}' tidak ditemukan.`
      );
      return res.status(200).json(response.toResponse());
    }

    await trx("users").where("id", id).update({
      account_status: 3,
      deactivate_at: trx.fn.now(),
      deleted_at: trx.fn.now(),
    });

    await activityLogHelper.logDelete(
      {
        userId: activityLogHelper.fromReq(req),
        module: "kmis",
        subject: "Akun Pengajar",
      },
      trx
    );

    await trx.commit();

    const response = new WithoutDataResource(
      200,
      "SUCCESS_DELETE_DATA",
      "Berhasil Menghapus Data",
      `Akun pengajar dengan email '${existing.email}' berhasil dihapus (soft delete) dan dinonaktifkan..`
    );
    return res.status(200).json(response.toResponse());
  } catch (error) {
    await trx.rollback();
    logger.error(
      `| Educator KMIS | - Error function destroy : ${error.message}`
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

exports.restore = async (req, res) => {
  const { id } = req.params;
  const trx = await knex.transaction();

  try {
    const deletedUser = await trx("users")
      .where("id", id)
      .where("role_id", 2)
      .whereNotNull("deleted_at")
      .first();
    if (!deletedUser) {
      await trx.rollback();
      const response = new WithoutDataResource(
        200,
        "DATA_NOT_FOUND",
        "Data Tidak Ditemukan",
        `Akun pengajar dengan ID '${id}' tidak ditemukan atau belum dihapus.`
      );
      return res.status(200).json(response.toResponse());
    }

    const isDuplicate = await trx("users")
      .whereRaw("lower(email) = lower(?)", [deletedUser.email])
      .whereNull("deleted_at")
      .first();
    if (isDuplicate) {
      await trx.rollback();
      const response = new WithoutDataResource(
        400,
        "DUPLICATE_EMAIL",
        "Duplikat Data",
        `Akun pengajar dengan email '${deletedUser.email}' sudah digunakan oleh entri aktif lain. Silakan ubah email terlebih dahulu sebelum merestore.`
      );
      return res.status(400).json(response.toResponse());
    }

    await trx("users").where("id", id).update({
      account_status: 2,
      deactivate_at: null,
      deleted_at: null,
      updated_at: trx.fn.now(),
    });

    await activityLogHelper.logRestore(
      {
        userId: activityLogHelper.fromReq(req),
        module: "kmis",
        subject: "Akun Pengajar",
      },
      trx
    );

    await trx.commit();

    const response = new WithoutDataResource(
      200,
      "SUCCESS_RESTORE_DATA",
      "Berhasil Mengembalikan Data",
      `Akun pengajar dengan email '${deletedUser.email}' berhasil dikembalikan dan diaktifkan kembali.`
    );
    return res.status(200).json(response.toResponse());
  } catch (error) {
    logger.error(
      `| Educator KMIS | - Error function restore: ${error.message}`
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

exports.deactivateAccount = async (req, res) => {
  const trx = await knex.transaction();
  const id = req.params.id;

  try {
    const raw = req.body?.deactivateAccount;
    const deactivateAccount =
      typeof raw === "boolean"
        ? raw
        : typeof raw === "string"
        ? ["true", "1", "yes", "on"].includes(raw.toLowerCase())
        : false;

    const existing = await trx("users")
      .where("id", id)
      .where("role_id", 2)
      .first();
    if (!existing) {
      await trx.rollback();
      const response = new WithoutDataResource(
        200,
        "DATA_NOT_FOUND",
        "Data Tidak Ditemukan",
        `Akun pengajar dengan ID '${id}' tidak ditemukan.`
      );
      return res.status(200).json(response.toResponse());
    }

    if (deactivateAccount === true) {
      if (existing.account_status === 3) {
        await trx.commit();
        const response = new WithoutDataResource(
          200,
          "ALREADY_DEACTIVATED",
          "Akun Sudah Dinonaktifkan",
          `Akun pengajar dengan email '${existing.email}' sudah dalam status nonaktif.`
        );
        return res.status(200).json(response.toResponse());
      }

      await trx("users").where("id", id).update({
        account_status: 3,
        deactivate_at: trx.fn.now(),
        updated_at: trx.fn.now(),
      });

      await activityLogHelper.logUpdate(
        {
          userId: activityLogHelper.fromReq(req),
          module: "kmis",
          subject: "Akun Pengajar",
        },
        trx
      );

      await trx.commit();

      const response = new WithoutDataResource(
        200,
        "SUCCESS_DEACTIVATE_ACCOUNT",
        "Berhasil Nonaktifkan Akun",
        `Akun pengajar dengan email '${existing.email}' berhasil dinonaktifkan.`
      );
      return res.status(200).json(response.toResponse());
    }

    await trx.commit();
    const response = new WithoutDataResource(
      200,
      "NO_ACTION",
      "Tidak Ada Perubahan",
      "Payload 'deactivateAccount' bernilai false atau tidak dikirim. Akun tetap seperti semula."
    );
    return res.status(200).json(response.toResponse());
  } catch (error) {
    await trx.rollback();
    logger.error(
      `| Educator KMIS | - Error function deactivateAccount : ${error.message}`
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
  const { id } = req.params;
  const trx = await knex.transaction();

  try {
    const raw = req.body?.activateAccount;
    const activateAccount =
      typeof raw === "boolean"
        ? raw
        : typeof raw === "string"
        ? ["true", "1", "yes", "on"].includes(raw.toLowerCase())
        : false;

    const existing = await trx("users")
      .where("id", id)
      .where("role_id", 2)
      .first();
    if (!existing) {
      await trx.rollback();
      const response = new WithoutDataResource(
        200,
        "DATA_NOT_FOUND",
        "Data Tidak Ditemukan",
        `Akun pengajar dengan ID '${id}' tidak ditemukan.`
      );
      return res.status(200).json(response.toResponse());
    }

    if (!activateAccount) {
      await trx.commit();
      const response = new WithoutDataResource(
        200,
        "NO_ACTION",
        "Tidak Ada Perubahan",
        "Payload 'activateAccount' bernilai false atau tidak dikirim. Akun tetap seperti semula."
      );
      return res.status(200).json(response.toResponse());
    }

    if (existing.account_status === 2) {
      await trx.commit();
      const response = new WithoutDataResource(
        200,
        "ALREADY_ACTIVE",
        "Akun Sudah Aktif",
        `Akun pengajar dengan email '${existing.email}' sudah dalam status aktif.`
      );
      return res.status(200).json(response.toResponse());
    }

    if (existing.account_status === 1 || existing.account_status === 3) {
      await trx("users").where("id", id).update({
        account_status: 2,
        deactivate_at: null,
        updated_at: trx.fn.now(),
      });

      await activityLogHelper.logUpdate(
        {
          userId: activityLogHelper.fromReq(req),
          module: "kmis",
          subject: "Akun Pengajar",
        },
        trx
      );

      await trx.commit();
      const response = new WithoutDataResource(
        200,
        "SUCCESS_ACTIVATE",
        "Berhasil Mengaktifkan Akun",
        `Akun pengajar dengan email '${existing.email}' berhasil diaktifkan.`
      );
      return res.status(200).json(response.toResponse());
    }
  } catch (error) {
    logger.error(
      `| Educator KMIS | - Error function activateAccount: ${error.message}`
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
