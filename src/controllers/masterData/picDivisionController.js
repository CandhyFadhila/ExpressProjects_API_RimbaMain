const { validationResult } = require("express-validator");
const knex = require("../../config/database");
const logger = require("../../utils/logger");
const { asJsonb } = require("../../helpers/dbJson");
const {
  applySearch,
  applyPagination,
  formatPaginationResult,
} = require("../../helpers/queryHelper");
const {
  normIdArray,
  parseJsonSafe,
  isPlainObject,
} = require("../../helpers/inputNorm");
const WithDataResource = require("../../resources/WithDataResource");
const WithoutDataResource = require("../../resources/WithoutDataResource");
const picDivisionResource = require("../../resources/masterData/picDivisionResource");
const activityLogHelper = require("../../helpers/activityLogHelper");
const { applyTrashedScope } = require("../../helpers/roleAbilityCheckHelper");
const { applyLatestThenTrashed } = require("../../helpers/queryOrderHelper");

exports.index = async (req, res) => {
  const { search } = req.query;

  try {
    let query = knex("monev_pic_divisions as division").select("division.*");

    applyTrashedScope(query, req, "division.deleted_at");

    applySearch(query, search, ["division.title"]);

    applyLatestThenTrashed(
      query,
      "division.deleted_at",
      "division.created_at",
      "division.id"
    );

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
      result.data.map((division) => picDivisionResource(division))
    );

    const response = new WithDataResource(
      200,
      "SUCCESS_GET_DATA",
      "Berhasil Mengambil Data",
      "Data divisi berhasil diambil.",
      {
        data: serializedData,
        pagination: result.pagination,
      }
    );
    return res.status(200).json(response.toResponse());
  } catch (error) {
    logger.error(
      `| PIC Division MONEV | - Error function index : ${error.message}`
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

exports.store = async (req, res) => {
  const trx = await knex.transaction();
  const { title, description } = req.body;

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

    const exists = await trx("monev_pic_divisions")
      .whereRaw("lower(title) = lower(?)", [title])
      .whereNull("deleted_at")
      .first();
    if (exists) {
      await trx.rollback();
      const response = new WithoutDataResource(
        422,
        "DUPLICATE_TITLE",
        "Duplikat Data",
        `Judul divisi '${title}' sudah digunakan. Silakan gunakan judul lain.`
      );
      return res.status(422).json(response.toResponse());
    }

    await trx("monev_pic_divisions")
      .insert({
        title,
        description,
      })
      .returning("*");

    await activityLogHelper.logCreate(
      {
        userId: activityLogHelper.fromReq(req),
        module: "master_data",
        subject: "List Kategori Divisi PIC",
      },
      trx
    );

    await trx.commit();

    const response = new WithoutDataResource(
      201,
      "SUCCESS_CREATE_DATA",
      "Berhasil Menyimpan Data",
      `Data divisi '${title}' berhasil ditambahkan.`
    );
    return res.status(201).json(response.toResponse());
  } catch (error) {
    await trx.rollback();
    logger.error(
      `| PIC Division MONEV | - Error function store: ${error.message}`
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

exports.show = async (req, res) => {
  const { id } = req.params;

  try {
    const division = await knex("monev_pic_divisions")
      .select("*")
      .where("id", id)
      .first();
    if (!division) {
      const response = new WithoutDataResource(
        200,
        "DATA_NOT_FOUND",
        "Data Tidak Ditemukan",
        `Data divisi dengan ID '${id}' tidak ditemukan.`
      );
      return res.status(200).json(response.toResponse());
    }

    const data = await picDivisionResource(division);
    const response = new WithDataResource(
      200,
      "SUCCESS_GET_DATA",
      "Berhasil Mengambil Data",
      `Detail data divisi '${division.title}' berhasil didapatkan.`,
      data
    );
    return res.status(200).json(response.toResponse());
  } catch (error) {
    logger.error(
      `| PIC Division MONEV | - Error function show: ${error.message}`
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

exports.update = async (req, res) => {
  const trx = await knex.transaction();
  const { title, description, userIds } = req.body;
  const id = req.params.id;

  const rawUserIds = normIdArray(userIds, { as: "number" }).filter(
    Number.isFinite
  );
  const uniqueUserIds = [...new Set(rawUserIds)];

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

    const existing = await trx("monev_pic_divisions").where("id", id).first();
    if (!existing) {
      await trx.rollback();
      const response = new WithoutDataResource(
        200,
        "DATA_NOT_FOUND",
        "Data Tidak Ditemukan",
        `Data divisi dengan ID '${id}' tidak ditemukan.`
      );
      return res.status(200).json(response.toResponse());
    }

    const duplicate = await trx("monev_pic_divisions")
      .whereRaw("lower(title) = lower(?)", [title])
      .whereNull("deleted_at")
      .whereNot("id", id)
      .first();
    if (duplicate) {
      await trx.rollback();
      const response = new WithoutDataResource(
        422,
        "DUPLICATE_TITLE",
        "Duplikat Data",
        `Judul '${title}' sudah digunakan pada divisi lain.`
      );
      return res.status(422).json(response.toResponse());
    }

    if (uniqueUserIds.includes(1)) {
      await trx.rollback();
      const response = new WithoutDataResource(
        422,
        "FORBIDDEN_USER_ID",
        "User Tidak Diizinkan",
        "User dengan ID 1 (super admin) tidak boleh ditetapkan sebagai PIC."
      );
      return res.status(422).json(response.toResponse());
    }

    if (uniqueUserIds.length > 0) {
      const foundIds = await trx("users")
        .whereIn("id", uniqueUserIds)
        .pluck("id");
      const foundSet = new Set(foundIds.map(Number));
      const missing = uniqueUserIds.filter((id) => !foundSet.has(id));
      if (missing.length > 0) {
        await trx.rollback();
        const response = new WithoutDataResource(
          422,
          "INVALID_USER_IDS",
          "Pengguna Tidak Ditemukan",
          `Beberapa userIds tidak valid: ${missing.join(", ")}.`
        );
        return res.status(422).json(response.toResponse());
      }
    }

    await trx("monev_pic_divisions")
      .where("id", id)
      .update({
        user_pic: asJsonb(uniqueUserIds),
        title,
        description,
        updated_at: trx.fn.now(),
      });

    await activityLogHelper.logUpdate(
      {
        userId: activityLogHelper.fromReq(req),
        module: "master_data",
        subject: "List Kategori Divisi PIC",
      },
      trx
    );

    await trx.commit();

    const response = new WithoutDataResource(
      200,
      "SUCCESS_UPDATE_DATA",
      "Berhasil Memperbarui",
      `Data divisi '${title}' berhasil diperbarui.`
    );
    return res.status(200).json(response.toResponse());
  } catch (error) {
    await trx.rollback();
    logger.error(
      `| PIC Division MONEV | - Error function update : ${error.message}`
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

    const existing = await trx("monev_pic_divisions")
      .select("id", "title")
      .whereIn("id", ids)
      .whereNull("deleted_at");
    if (existing.length === 0) {
      await trx.rollback();
      const response = new WithoutDataResource(
        200,
        "DATA_NOT_FOUND",
        "Data Tidak Ditemukan",
        `Tidak ada data divisi yang cocok atau sudah terhapus.`
      );
      return res.status(200).json(response.toResponse());
    }

    const existingIds = existing.map((r) => r.id);

    await trx("monev_pic_divisions").whereIn("id", existingIds).update({
      deleted_at: trx.fn.now(),
    });

    await activityLogHelper.logDelete(
      {
        userId: activityLogHelper.fromReq(req),
        module: "master_data",
        subject: "List Kategori Divisi PIC",
      },
      trx
    );

    await trx.commit();

    const response = new WithoutDataResource(
      200,
      "SUCCESS_DELETE_DATA",
      "Berhasil Menghapus Data",
      `Berhasil menghapus (soft delete) ${existingIds.length} data divisi.`
    );
    return res.status(200).json(response.toResponse());
  } catch (error) {
    await trx.rollback();
    logger.error(
      `| PIC Division MONEV | - Error function destroy : ${error.message}`
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

    const softDeleted = await trx("monev_pic_divisions")
      .select("id", "title")
      .whereIn("id", ids)
      .whereNotNull("deleted_at");
    if (softDeleted.length === 0) {
      await trx.rollback();
      const response = new WithoutDataResource(
        200,
        "DATA_NOT_FOUND",
        "Data Tidak Ditemukan",
        `Tidak ada data divisi terhapus yang cocok untuk direstore.`
      );
      return res.status(200).json(response.toResponse());
    }

    // 1) Cek bentrok judul dengan entri aktif
    const titlesLower = softDeleted.map((r) => r.title?.toLowerCase?.() ?? "");
    const activeWithSameTitle = await trx("monev_pic_divisions")
      .select(knex.raw("lower(title) AS ltitle"))
      .whereNull("deleted_at")
      .whereIn(knex.raw("lower(title)"), titlesLower);

    const conflictActive = new Set(activeWithSameTitle.map((r) => r.ltitle));

    // 2) Cek duplikat judul di dalam batch restore sendiri
    const seenBatch = new Set();
    const duplicateInBatch = new Set();
    for (const r of softDeleted) {
      const lt = (r.title || "").toLowerCase();
      if (seenBatch.has(lt)) duplicateInBatch.add(lt);
      else seenBatch.add(lt);
    }

    // 3) Tentukan mana yang boleh direstore (tidak bentrok & bukan duplikat batch)
    const restorable = [];
    const skippedConflicts = [];
    const takenInBatch = new Set(); // untuk hanya ambil satu per title di batch

    for (const r of softDeleted) {
      const lt = (r.title || "").toLowerCase();
      const hasActiveConflict = conflictActive.has(lt);
      const hasBatchDup = duplicateInBatch.has(lt);
      if (hasActiveConflict || hasBatchDup) {
        skippedConflicts.push({ id: r.id, title: r.title });
        continue;
      }
      if (takenInBatch.has(lt)) {
        // safety: kalau ada urutan ganda, skip
        skippedConflicts.push({ id: r.id, title: r.title });
        continue;
      }
      takenInBatch.add(lt);
      restorable.push(r);
    }

    // 4) Eksekusi restore
    let restoredCount = 0;
    if (restorable.length > 0) {
      const idsToRestore = restorable.map((r) => r.id);
      await trx("monev_pic_divisions")
        .whereIn("id", idsToRestore)
        .update({ deleted_at: null, updated_at: trx.fn.now() });
      restoredCount = idsToRestore.length;
    }

    await activityLogHelper.logRestore(
      {
        userId: activityLogHelper.fromReq(req),
        module: "master_data",
        subject: "List Kategori Divisi PIC",
      },
      trx
    );

    await trx.commit();

    if (restoredCount === 0) {
      const response = new WithoutDataResource(
        422,
        "DUPLICATE_NAME",
        "Restore Gagal",
        "Semua ID gagal direstore karena duplikat data dengan entri aktif atau duplikat data di dalam batch."
      );
      return res.status(422).json(response.toResponse());
    }

    const descParts = [
      `Berhasil mengembalikan ${restoredCount} data yang terhapus.`,
    ];
    if (skippedConflicts.length) {
      descParts.push(
        `Terlewat ${skippedConflicts.length} karena bentrok/duplikat data.`
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
      `| PIC Division MONEV | - Error function restore: ${error.message}`
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

exports.assignPic = async (req, res) => {
  const trx = await knex.transaction();
  const { userPic } = req.body;
  const id = req.params.id;

  try {
    const existing = await trx("monev_pic_divisions").where("id", id).first();
    if (!existing) {
      await trx.rollback();
      const response = new WithoutDataResource(
        200,
        "DATA_NOT_FOUND",
        "Data Tidak Ditemukan",
        `Data divisi dengan ID '${id}' tidak ditemukan.`
      );
      return res.status(200).json(response.toResponse());
    }

    const parsed = handleUserPicArray(userPic, {
      allowEmpty: false,
      fieldLabel: "userPic",
      maxNameLen: 255,
      maxEmailLen: 255,
    });
    if (parsed.error) {
      await trx.rollback();
      return res.status(422).json(parsed.error.toResponse());
    }
    const list = parsed.value; // [{name, email}, ...]

    const checked = await validatePicUsers(trx, id, list);
    if (checked.error) {
      await trx.rollback();
      return res.status(422).json(checked.error.toResponse());
    }

    await trx("monev_pic_divisions")
      .where("id", id)
      .update({
        user_pic: asJsonb(list),
        updated_at: trx.fn.now(),
      });

    await activityLogHelper.logUpdate(
      {
        userId: activityLogHelper.fromReq(req),
        module: "master_data",
        subject: "Assign Pengguna Divisi PIC",
      },
      trx
    );

    await trx.commit();

    const response = new WithoutDataResource(
      200,
      "SUCCESS_ASSIGN_PIC",
      "Berhasil Memperbarui",
      "Data PIC berhasil diperbarui."
    );
    return res.status(200).json(response.toResponse());
  } catch (error) {
    await trx.rollback();
    logger.error(
      `| PIC Division MONEV | - Error function update : ${error.message}`
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

function handleUserPicArray(rawContent, opts = {}) {
  const {
    allowEmpty = false,
    maxNameLen = 255,
    maxEmailLen = 255,
    fieldLabel = "userPic",
  } = opts;

  let arr = rawContent;
  if (typeof arr === "string") arr = parseJsonSafe(arr) ?? arr;

  if (!Array.isArray(arr)) {
    const err = new WithoutDataResource(
      422,
      "INVALID_CONTENT_FORMAT",
      "Format Konten Salah",
      `${fieldLabel} format harus array of object dengan properti { name: string, email: string }.`
    );
    return { error: err };
  }

  // regex email sederhana & robust
  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;

  const cleaned = arr
    .map((it) => {
      if (!isPlainObject(it)) return null;
      let { name, email } = it;

      // validasi name
      if (typeof name !== "string") return null;
      name = name.trim();
      if (name.length === 0) return null;
      if (typeof maxNameLen === "number" && name.length > maxNameLen)
        return null;

      // validasi email
      if (typeof email !== "string") return null;
      email = email.trim();
      if (email.length === 0) return null;
      if (typeof maxEmailLen === "number" && email.length > maxEmailLen)
        return null;
      if (!emailRe.test(email)) return null; // format email invalid

      return { name, email };
    })
    .filter(Boolean);

  if (!allowEmpty && cleaned.length === 0) {
    const err = new WithoutDataResource(
      422,
      "INVALID_CONTENT_ITEMS",
      "Elemen Konten Tidak Valid",
      `Setiap elemen ${fieldLabel} harus objek { name, email } dan minimal satu elemen valid.`
    );
    return { error: err };
  }

  // dedupe by lower(email)
  const seen = new Set();
  const unique = [];
  for (const it of cleaned) {
    const key = it.email.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(it);
    }
  }

  return { value: unique };
}

async function validatePicUsers(trx, divisionId, list) {
  const emailsLower = list.map((x) => x.email.toLowerCase());

  // ---- 1) Ambil users by email (lowercase)
  let usersByEmail = [];
  if (emailsLower.length > 0) {
    usersByEmail = await trx("users")
      .select("id", "email", "role_id")
      .whereIn(trx.raw("lower(email)"), emailsLower);
  }

  // a) Email harus terdaftar
  const emailSet = new Set(
    usersByEmail.map((u) => String(u.email).toLowerCase())
  );
  const missing = emailsLower.filter((e) => !emailSet.has(e));
  if (missing.length > 0) {
    return {
      error: new WithoutDataResource(
        422,
        "INVALID_USER_EMAILS",
        "Pengguna Tidak Ditemukan",
        `Beberapa email tidak terdaftar: ${missing.join(", ")}.`
      ),
    };
  }

  // b) Semua user yang diassign harus role_id === 1
  const invalidRoles = usersByEmail
    .filter((u) => Number(u.role_id) !== 1)
    .map((u) => u.email);
  if (invalidRoles.length > 0) {
    return {
      error: new WithoutDataResource(
        422,
        "INVALID_USER_ROLES",
        "Role Tidak Diizinkan",
        `Hanya pengguna dengan role_id = 1 yang boleh ditetapkan sebagai PIC. Tidak valid: ${invalidRoles.join(
          ", "
        )}.`
      ),
    };
  }

  // c) Larang super admin utama (id === 1)
  if (usersByEmail.some((u) => Number(u.id) === 1)) {
    return {
      error: new WithoutDataResource(
        422,
        "FORBIDDEN_USER_ID",
        "User Tidak Diizinkan",
        "User dengan ID 1 (super admin) tidak boleh ditetapkan sebagai PIC."
      ),
    };
  }

  // d) Cek rangkap divisi (email sudah ada di divisi lain)
  if (emailsLower.length > 0) {
    const placeholders = emailsLower.map(() => "?").join(",");
    const conflictSQL = `
      SELECT d.id, d.title, lower(e->>'email') AS email
      FROM monev_pic_divisions d
      CROSS JOIN LATERAL jsonb_array_elements(COALESCE(d.user_pic, '[]'::jsonb)) AS e
      WHERE d.deleted_at IS NULL
        AND d.id <> ?
        AND lower(e->>'email') IN (${placeholders})
    `;
    const { rows: conflicts } = await trx.raw(conflictSQL, [
      divisionId,
      ...emailsLower,
    ]);

    if (conflicts.length > 0) {
      // group by email → daftar divisi yang konflik
      const byEmail = conflicts.reduce((acc, r) => {
        (acc[r.email] ||= []).push(r.title ?? `Divisi #${r.id}`);
        return acc;
      }, {});
      const detail = Object.entries(byEmail)
        .map(
          ([email, titles]) =>
            `${email} (sudah ada di divisi: ${[...new Set(titles)].join(", ")})`
        )
        .join("; ");

      return {
        error: new WithoutDataResource(
          422,
          "DUPLICATE_PIC_ASSIGNMENT",
          "Rangkap Divisi Tidak Diizinkan",
          `Beberapa email sudah terdaftar pada divisi lain: ${detail}.`
        ),
      };
    }
  }

  return { usersByEmail };
}
