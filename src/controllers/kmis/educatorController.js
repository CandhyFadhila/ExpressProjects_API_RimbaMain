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
const educatorResource = require("../../resources/kmis/educatorResource");
const activityLogHelper = require("../../helpers/activityLogHelper");
const {
  stripTitlesOnly,
  generateRandomPassword,
} = require("../../helpers/credentialHelper");
const { checkEmailDeliverability } = require("../../helpers/emailValidChecker");
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

    // --- DEBUG: ID educator di halaman ini ---
    const idsRaw = result.data.map((r) => r.id);
    const ids = idsRaw.map((v) => Number(v)).filter(Number.isFinite);
    console.log("[educator.index] idsRaw:", idsRaw);
    console.log("[educator.index] ids (numeric):", ids);

    // Hitung total material per user sekali saja
    const totalsQB = knex("kmis_materials as m")
      .whereNull("m.deleted_at")
      .andWhere(function () {
        this.whereIn("m.uploaded_by", ids).orWhereIn("m.created_by", ids);
      })
      .select(knex.raw("COALESCE(m.uploaded_by, m.created_by) AS owner_id"))
      .count({ total: "*" })
      .groupByRaw("COALESCE(m.uploaded_by, m.created_by)");

    // --- DEBUG: SQL & bindings ---
    const { sql, bindings } = totalsQB.toSQL();
    console.log("[educator.index] totals SQL:", sql);
    console.log("[educator.index] totals bindings:", bindings);

    const totals = await totalsQB;

    // --- DEBUG: hasil agregasi ---
    console.log("[educator.index] totals rows:", totals);

    // --- DEBUG tambahan: hitung terpisah utk memastikan kolom mana yang terpakai ---
    const dbgUploaded = await knex("kmis_materials as m")
      .whereNull("m.deleted_at")
      .whereIn("m.uploaded_by", ids)
      .count({ c: "*" });
    const dbgCreated = await knex("kmis_materials as m")
      .whereNull("m.deleted_at")
      .whereIn("m.created_by", ids)
      .count({ c: "*" });
    console.log("[educator.index] dbg uploaded_by count:", dbgUploaded?.[0]?.c);
    console.log("[educator.index] dbg created_by count:", dbgCreated?.[0]?.c);

    // --- DEBUG: ambil sampel baris yang match ---
    const sampleRows = await knex("kmis_materials as m")
      .select("m.id", "m.created_by", "m.uploaded_by", "m.deleted_at")
      .whereNull("m.deleted_at")
      .andWhere(function () {
        this.whereIn("m.uploaded_by", ids).orWhereIn("m.created_by", ids);
      })
      .limit(5);
    console.log("[educator.index] sample materials:", sampleRows);

    const totalMap = new Map(
      totals.map((t) => [Number(t.owner_id), Number(t.total)])
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
      `[email-check] ${email} -> ${probe.ok} (${probe.reason}) ${JSON.stringify(
        probe.detail || []
      )}`
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
        `Email '${email}' sudah digunakan oleh akun pengajar lain. Silakan gunakan email lain.`
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
        role_id: 2,
        account_status: 2,
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
      `| Educator KMIS | - Credential email successfully sent to ${
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
        422,
        "FAILED_VALIDATION",
        "Format Data Tidak Sesuai Ketentuan",
        message
      );
      return res.status(422).json(response.toResponse());
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

    const probe = await checkEmailDeliverability(email, {
      useSmtp: true,
      strict: false, // penting: hindari false negative dari TEMP/UNAVAILABLE
      timeoutMs: 7000,
      maxMx: 3,
    });

    logger.info(
      `[email-check] ${email} -> ${probe.ok} (${probe.reason}) ${JSON.stringify(
        probe.detail || []
      )}`
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

    const duplicate = await trx("users")
      .whereRaw("lower(email) = lower(?)", [email])
      .whereNull("deleted_at")
      .whereNot("id", id)
      .first();
    if (duplicate) {
      const response = new WithoutDataResource(
        422,
        "DUPLICATE_TITLE",
        "Duplikat Data",
        `Email '${email}' sudah digunakan pada pengguna lain.`
      );
      return res.status(422).json(response.toResponse());
    }

    const patch = {
      name,
      email,
      updated_at: trx.fn.now(),
    };

    await trx("users").where("id", id).update(patch);

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
      "Berhasil Memperbarui Data",
      `Akun pengajar dengan email '${email}' berhasil diperbarui.`
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

  try {
    const ids = normIdArray(req.body?.deleteIds, { as: "number" }).filter(
      Number.isFinite
    );
    if (ids.length === 0) {
      await trx.rollback();
      const response = new WithoutDataResource(
        422,
        "INVALID_INPUT",
        "Gagal Menghapus Data",
        "Mohon kirimkan deleteIds berupa array ID numerik, misal: [1,2,3]."
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

    const alreadyDeleted = await trx("users")
      .whereIn("id", ids)
      .where("role_id", 2)
      .where("account_status", 3)
      .whereNotNull("deactivate_at")
      .select("id", "name");
    if (alreadyDeleted.length > 0) {
      await trx.rollback();
      const list = alreadyDeleted
        .slice(0, 5)
        .map((u) => `'${u.name}' (ID: ${u.id})`)
        .join(", ");
      const extra =
        alreadyDeleted.length > 5
          ? `, dan ${alreadyDeleted.length - 5} lainnya`
          : "";

      const response = new WithoutDataResource(
        409,
        "ACCOUNT_ALREADY_DELETED",
        "Akun Sudah Dihapus",
        `Terdapat ${alreadyDeleted.length} akun pengajar yang sudah dihapus: ${list}${extra}. Operasi dibatalkan.`
      );
      return res.status(409).json(response.toResponse());
    }

    const existing = await trx("users")
      .whereIn("id", ids)
      .where("role_id", 2)
      .whereNot("account_status", 3)
      .select("id", "name");
    if (existing.length === 0) {
      await trx.rollback();
      const response = new WithoutDataResource(
        200,
        "DATA_NOT_FOUND",
        "Data Tidak Ditemukan",
        `Tidak ada data pengguna yang cocok atau sudah terhapus.`
      );
      return res.status(200).json(response.toResponse());
    }

    const existingIds = existing.map((r) => r.id);

    await trx("users").whereIn("id", existingIds).update({
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
      `Berhasil menghapus (soft delete) dan menonaktifkan ${existingIds.length} data pengajar.`
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
  const trx = await knex.transaction();

  try {
    const ids = normIdArray(req.body?.restoreIds, { as: "number" }).filter(
      Number.isFinite
    );
    if (ids.length === 0) {
      await trx.rollback();
      const response = new WithoutDataResource(
        422,
        "INVALID_INPUT",
        "Gagal Menghapus Data",
        "Mohon kirimkan restoreIds berupa array ID numerik, misal: [1,2,3]."
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
        `Maksimal id yang bisa dikembalikan adalah ${MAX_BULK} ID.`
      );
      return res.status(422).json(response.toResponse());
    }

    const alreadyRestored = await trx("users")
      .whereIn("id", ids)
      .where("role_id", 2)
      .where("account_status", 2)
      .whereNull("deleted_at")
      .select("id", "name");
    if (alreadyRestored.length > 0) {
      await trx.rollback();
      const list = alreadyRestored
        .slice(0, 5)
        .map((u) => `'${u.name}' (ID: ${u.id})`)
        .join(", ");
      const extra =
        alreadyRestored.length > 5
          ? `, dan ${alreadyRestored.length - 5} lainnya`
          : "";

      const response = new WithoutDataResource(
        409,
        "ACCOUNT_NOT_DELETED",
        "Akun Belum Terhapus",
        `Terdapat ${alreadyRestored.length} akun pengajar yang belum terhapus atau sudah dikembalikan: ${list}${extra}. Operasi dibatalkan.`
      );
      return res.status(409).json(response.toResponse());
    }

    const softDeleted = await trx("users")
      .select("id", "email")
      .whereIn("id", ids)
      .where("role_id", 2)
      .where("account_status", 3)
      .whereNotNull("deleted_at");
    if (softDeleted.length === 0) {
      await trx.rollback();
      const response = new WithoutDataResource(
        200,
        "DATA_NOT_FOUND",
        "Data Tidak Ditemukan",
        `Tidak ada data akun pengajar terhapus yang cocok untuk direstore.`
      );
      return res.status(200).json(response.toResponse());
    }

    // 1) Cek bentrok email dengan entri aktif lain (case-insensitive)
    const emailsLower = softDeleted.map((r) => (r.email || "").toLowerCase());
    const activeWithSameEmail = await trx("users")
      .select(knex.raw("lower(email) AS lemail"))
      .whereNull("deleted_at")
      .whereIn(knex.raw("lower(email)"), emailsLower);

    const conflictActive = new Set(activeWithSameEmail.map((r) => r.lemail));

    // 2) Cek duplikat email di dalam batch restore sendiri
    const seenBatch = new Set();
    const duplicateInBatch = new Set();
    for (const r of softDeleted) {
      const le = (r.email || "").toLowerCase();
      if (seenBatch.has(le)) duplicateInBatch.add(le);
      else seenBatch.add(le);
    }

    // 3) Tentukan mana yang boleh direstore
    const restorable = [];
    const skippedConflicts = [];
    const takenInBatch = new Set(); // pastikan 1 email hanya direstore 1 item dalam batch

    for (const r of softDeleted) {
      const le = (r.email || "").toLowerCase();
      const hasActiveConflict = conflictActive.has(le);
      const hasBatchDup = duplicateInBatch.has(le);

      if (hasActiveConflict || hasBatchDup) {
        skippedConflicts.push({ id: r.id, email: r.email });
        continue;
      }
      if (takenInBatch.has(le)) {
        skippedConflicts.push({ id: r.id, email: r.email });
        continue;
      }
      takenInBatch.add(le);
      restorable.push(r);
    }

    // 4) Eksekusi restore
    let restoredCount = 0;
    if (restorable.length > 0) {
      const idsToRestore = restorable.map((r) => r.id);
      await trx("users").whereIn("id", idsToRestore).update({
        deleted_at: null,
        account_status: 2,
        deactivate_at: null,
        updated_at: trx.fn.now(),
      });
      restoredCount = idsToRestore.length;
    }

    await activityLogHelper.logRestore(
      {
        userId: activityLogHelper.fromReq(req),
        module: "kmis",
        subject: "Akun Pengajar",
      },
      trx
    );

    await trx.commit();

    if (restoredCount === 0) {
      const response = new WithoutDataResource(
        422,
        "DUPLICATE_EMAIL",
        "Restore Gagal",
        "Semua ID gagal direstore karena duplikat email dengan entri aktif atau duplikat email di dalam batch."
      );
      return res.status(422).json(response.toResponse());
    }

    const descParts = [
      `Berhasil mengembalikan dan mengaktifkan kembali ${restoredCount} data pengajar.`,
    ];
    if (skippedConflicts.length) {
      descParts.push(
        `Terlewat ${skippedConflicts.length} karena konflik/duplikat email.`
      );
    }

    const response = new WithoutDataResource(
      200,
      "SUCCESS_RESTORE_DATA",
      "Berhasil Mengembalikan Data",
      descParts.join(" ")
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
      .where("role_id", 2)
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
        `Terdapat ${alreadyInactive.length} akun pengajar yang sudah nonaktif: ${list}${extra}. Operasi dibatalkan.`
      );
      return res.status(409).json(response.toResponse());
    }

    // Ambil kandidat yang valid untuk dinonaktifkan
    const candidates = await trx("users")
      .select("id", "email")
      .whereIn("id", ids)
      .where("role_id", 2)
      .whereNull("deleted_at")
      .whereNot("account_status", 3);
    if (candidates.length === 0) {
      await trx.rollback();
      const response = new WithoutDataResource(
        200,
        "DATA_NOT_FOUND",
        "Data Tidak Ditemukan",
        "Tidak ada akun pengajar yang cocok untuk dinonaktifkan atau akun sudah nonaktif/terhapus."
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
        module: "kmis",
        subject: "Akun Pengajar",
      },
      trx
    );

    await trx.commit();

    const skipped = ids.length - idsToDeactivate.length;

    const parts = [
      `Berhasil menonaktifkan ${idsToDeactivate.length} akun pengajar.`,
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
      .where("role_id", 2)
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
        `Terdapat ${alreadyActive.length} akun pengajar yang sudah aktif: ${list}${extra}. Operasi dibatalkan.`
      );
      return res.status(409).json(response.toResponse());
    }

    const candidates = await trx("users")
      .select("id")
      .whereIn("id", ids)
      .where("role_id", 2)
      .whereNull("deleted_at")
      .whereNot("account_status", 2);
    if (candidates.length === 0) {
      await trx.rollback();
      const response = new WithoutDataResource(
        200,
        "DATA_NOT_FOUND",
        "Data Tidak Ditemukan",
        "Tidak ada akun pengajar yang cocok untuk diaktifkan atau akun sudah aktif/terhapus."
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
        module: "kmis",
        subject: "Akun Pengajar",
      },
      trx
    );

    await trx.commit();

    const skipped = ids.length - idsToActivate.length;
    const parts = [
      `Berhasil mengaktifkan ${idsToActivate.length} akun pengajar.`,
    ];
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
