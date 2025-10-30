const { validationResult } = require("express-validator");
const knex = require("../../config/database");
const logger = require("../../utils/logger");
const { normIdArray } = require("../../helpers/inputNorm");
const dateHelper = require("../../helpers/dateHelper");
const WithDataResource = require("../../resources/WithDataResource");
const WithoutDataResource = require("../../resources/WithoutDataResource");
const activityCalendarResource = require("../../resources/monev/activityCalendarResource");
const activityLogHelper = require("../../helpers/activityLogHelper");

const dayjs = require("dayjs");
const utc = require("dayjs/plugin/utc");
dayjs.extend(utc);

// --- Parser input tanggal → "YYYY-MM-DD" (UTC) ---
const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;
function normalizeToUTCDateString(input) {
  if (!input) return null;
  const s = String(input).trim();
  if (DATE_ONLY_RE.test(s)) {
    const d = dayjs.utc(`${s}T00:00:00Z`);
    return d.isValid() ? d.format("YYYY-MM-DD") : null;
  }
  if (dateHelper.isIso8601Z(s)) {
    const d = dayjs.utc(s);
    return d.isValid() ? d.format("YYYY-MM-DD") : null;
  }
  return null;
}

// --- Normalisasi nilai tanggal dari DB/objek → 'YYYY-MM-DD' ---
function normalizeRowDate(v) {
  if (!v) return null;
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  try {
    const d = dayjs.utc(v instanceof Date ? v.toISOString() : String(v));
    return d.isValid() ? d.format("YYYY-MM-DD") : null;
  } catch {
    return null;
  }
}

// --- Helper untuk comparator (akomodasi variasi field di resource) ---
function getStartDate(it) {
  const raw = it.startedDateUTC || it.started_date || it.startedDate || null;
  return normalizeRowDate(raw);
}
function getEndDate(it) {
  const raw = it.finishedDateUTC || it.finished_date || null;
  return normalizeRowDate(raw) || getStartDate(it);
}
function isMultiDay(it) {
  const sd = getStartDate(it);
  const ed = getEndDate(it);
  return sd && ed && ed > sd;
}
function startAtUTC(it) {
  const d = getStartDate(it);
  if (!d) return null;
  if (it.startedAtUTC) return it.startedAtUTC;
  const t = it.startedTimeUTC || it.started_time || "00:00:00";
  return `${d}T${t}Z`;
}
function endAtUTC(it) {
  const d = getEndDate(it) || getStartDate(it);
  if (!d) return null;
  if (it.finishedAtUTC) return it.finishedAtUTC;
  const t =
    it.finishedTimeUTC ||
    it.finished_time ||
    it.startedTimeUTC ||
    it.started_time ||
    "00:00:00";
  return `${d}T${t}Z`;
}

// --- Comparator final: multi-hari dulu, lalu satu-hari ---
function compareAgendaPerDay(a, b) {
  const aMulti = isMultiDay(a);
  const bMulti = isMultiDay(b);
  if (aMulti !== bMulti) return aMulti ? -1 : 1; // multi-hari di atas

  if (aMulti && bMulti) {
    const aSD = getStartDate(a) || "";
    const bSD = getStartDate(b) || "";
    if (aSD !== bSD) return aSD < bSD ? -1 : 1;

    const aDur = dayjs.utc(getEndDate(a)).diff(dayjs.utc(aSD), "day");
    const bDur = dayjs.utc(getEndDate(b)).diff(dayjs.utc(bSD), "day");
    if (aDur !== bDur) return bDur - aDur;

    const aS = startAtUTC(a) || "";
    const bS = startAtUTC(b) || "";
    if (aS !== bS) return aS < bS ? -1 : 1;

    const aE = endAtUTC(a) || "";
    const bE = endAtUTC(b) || "";
    if (aE !== bE) return aE < bE ? -1 : 1;

    const n = (a.name || "").localeCompare(b.name || "");
    if (n) return n;
    return (a.id || 0) - (b.id || 0);
  }

  // sama-sama satu-hari
  const aS = startAtUTC(a) || "";
  const bS = startAtUTC(b) || "";
  if (aS !== bS) return aS < bS ? -1 : 1;

  const aE = endAtUTC(a) || "";
  const bE = endAtUTC(b) || "";
  if (aE !== bE) return aE < bE ? -1 : 1;

  const n = (a.name || "").localeCompare(b.name || "");
  if (n) return n;
  return (a.id || 0) - (b.id || 0);
}

exports.index = async (req, res) => {
  const { startDate, endDate } = req.query;

  try {
    // 1) Tentukan range UTC (inklusif)
    let startStr = normalizeToUTCDateString(startDate);
    let endStr = normalizeToUTCDateString(endDate);

    // Default: bulan ini (UTC) bila keduanya kosong
    if (!startStr && !endStr) {
      const nowUTC = dayjs.utc();
      startStr = nowUTC.startOf("month").format("YYYY-MM-DD");
      endStr = nowUTC.endOf("month").format("YYYY-MM-DD");
    } else if (startStr && !endStr) {
      // Hanya start → end = akhir bulan start
      const s = dayjs.utc(`${startStr}T00:00:00Z`);
      endStr = s.endOf("month").format("YYYY-MM-DD");
    } else if (!startStr && endStr) {
      // Hanya end → start = awal bulan end
      const e = dayjs.utc(`${endStr}T00:00:00Z`);
      startStr = e.startOf("month").format("YYYY-MM-DD");
    }

    // Validasi final
    if (!startStr || !endStr) {
      const response = new WithoutDataResource(
        422,
        "FAILED_VALIDATION",
        "Format Data Tidak Sesuai Ketentuan",
        "Parameter startDate/endDate tidak valid. Gunakan YYYY-MM-DD atau ISO 8601 dengan Z/offset."
      );
      return res.status(422).json(response.toResponse());
    }

    // Pastikan urutan (inklusif)
    if (endStr < startStr) {
      const tmp = startStr;
      startStr = endStr;
      endStr = tmp;
    }

    // 2) Siapkan grid tanggal (inklusif)
    const dates = [];
    for (
      let d = dayjs.utc(`${startStr}T00:00:00Z`);
      !d.isAfter(dayjs.utc(`${endStr}T00:00:00Z`));
      d = d.add(1, "day")
    ) {
      dates.push(d.format("YYYY-MM-DD"));
    }
    const agendasByDate = new Map(dates.map((dt) => [dt, []]));

    // 3) Query event yang overlap dengan range tanggal (UTC)
    const rows = await knex("monev_activity_calendar as calendar")
      .leftJoin(
        "monev_activity_categories as category",
        "calendar.monev_activity_category_id",
        "category.id"
      )
      .select([
        "calendar.id",
        "calendar.created_by",
        "calendar.monev_activity_category_id",
        "calendar.name",
        "calendar.description",
        "calendar.location",
        knex.raw("calendar.started_date::text AS started_date"),
        knex.raw("calendar.finished_date::text AS finished_date"),
        "calendar.started_time",
        "calendar.finished_time",
        "calendar.created_at",
        "calendar.updated_at",
        "calendar.deleted_at",
      ])
      .whereNull("calendar.deleted_at")
      .whereRaw(
        "calendar.started_date <= ? AND COALESCE(calendar.finished_date, calendar.started_date) >= ?",
        [endStr, startStr]
      )
      .orderBy("calendar.started_date", "asc")
      .orderBy("calendar.started_time", "asc")
      .orderBy("calendar.name", "asc");

    // 4) Resource sekali per event
    const resources = await Promise.all(
      rows.map((r) => activityCalendarResource(r))
    );
    const byId = new Map(rows.map((r, i) => [r.id, resources[i]]));

    // 5) Expand event multi-hari ke setiap tanggal yang ter-cover (dibatasi window)
    for (const r of rows) {
      const evStart = normalizeRowDate(r.started_date); // 'YYYY-MM-DD'
      const evEnd =
        normalizeRowDate(r.finished_date || r.started_date) || evStart;

      // batasi ke window yang diminta (string tanggal 'YYYY-MM-DD')
      const fromStr = evStart < startStr ? startStr : evStart;
      const toStr = evEnd > endStr ? endStr : evEnd;

      for (
        let d = dayjs.utc(`${fromStr}T00:00:00Z`);
        !d.isAfter(dayjs.utc(`${toStr}T00:00:00Z`));
        d = d.add(1, "day")
      ) {
        const key = d.format("YYYY-MM-DD");
        const bucket = agendasByDate.get(key);
        if (bucket) bucket.push(byId.get(r.id));
      }
    }

    // 6) Susun serialized data: hari kosong = null, dan urutkan per hari
    const serializedData = dates.map((dt) => {
      const items = agendasByDate.get(dt) || [];
      items.sort(compareAgendaPerDay);
      return {
        date: dt,
        agendas: items.length ? items : null,
      };
    });

    const response = new WithDataResource(
      200,
      "SUCCESS_GET_DATA",
      "Berhasil Mengambil Data",
      "Data kegiatan berhasil didapatkan.",
      serializedData
    );
    return res.status(200).json(response.toResponse());
  } catch (error) {
    logger.error(
      `| Activity Calendar MONEV | - Error function index : ${error.message}`
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
  const {
    activityCategoryId,
    name,
    description,
    location,
    startedDate,
    finishedDate,
    startedTime,
    finishedTime,
  } = req.body;
  const userId = activityLogHelper.fromReq(req);

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

    const exists = await trx("monev_activity_calendar")
      .whereRaw("lower(name) = lower(?)", [name])
      .whereNull("deleted_at")
      .first();
    if (exists) {
      const response = new WithoutDataResource(
        422,
        "DUPLICATE_TITLE",
        "Duplikat Data",
        `Nama kegiatan '${name}' sudah digunakan. Silakan gunakan judul lain.`
      );
      return res.status(422).json(response.toResponse());
    }

    await trx("monev_activity_calendar")
      .insert({
        created_by: userId,
        monev_activity_category_id: activityCategoryId,
        name,
        description,
        location,
        started_date: startedDate,
        finished_date: finishedDate,
        started_time: startedTime,
        finished_time: finishedTime,
      })
      .returning("*");

    await activityLogHelper.logCreate(
      {
        userId: activityLogHelper.fromReq(req),
        module: "monev",
        subject: "Kegiatan Kalender",
      },
      trx
    );

    await trx.commit();

    const response = new WithoutDataResource(
      201,
      "SUCCESS_CREATE_DATA",
      "Berhasil Menyimpan Data",
      `Data kegiatan '${name}' berhasil ditambahkan.`
    );
    return res.status(201).json(response.toResponse());
  } catch (error) {
    await trx.rollback();
    logger.error(
      `| Activity Calendar MONEV | - Error function store: ${error.message}`
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
    const activity = await knex("monev_activity_calendar")
      .select("*")
      .where("id", id)
      .first();
    if (!activity) {
      const response = new WithoutDataResource(
        200,
        "DATA_NOT_FOUND",
        "Data Tidak Ditemukan",
        `Data kegiatan dengan ID '${id}' tidak ditemukan.`
      );
      return res.status(200).json(response.toResponse());
    }

    const data = await activityCalendarResource(activity);
    const response = new WithDataResource(
      200,
      "SUCCESS_GET_DATA",
      "Berhasil Mengambil Data",
      `Detail data kegiatan '${activity.name}' berhasil didapatkan.`,
      data
    );
    return res.status(200).json(response.toResponse());
  } catch (error) {
    logger.error(
      `| Activity Calendar MONEV | - Error function show: ${error.message}`
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
  const {
    activityCategoryId,
    name,
    description,
    location,
    startedDate,
    finishedDate,
    startedTime,
    finishedTime,
  } = req.body;
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

    const existing = await trx("monev_activity_calendar")
      .where("id", id)
      .first();
    if (!existing) {
      const response = new WithoutDataResource(
        200,
        "DATA_NOT_FOUND",
        "Data Tidak Ditemukan",
        `Data kegiatan dengan ID '${id}' tidak ditemukan.`
      );
      return res.status(200).json(response.toResponse());
    }

    const duplicate = await trx("monev_activity_calendar")
      .whereRaw("lower(name) = lower(?)", [name])
      .whereNull("deleted_at")
      .whereNot("id", id)
      .first();
    if (duplicate) {
      const response = new WithoutDataResource(
        422,
        "DUPLICATE_TITLE",
        "Duplikat Data",
        `Nama kegiatan '${name}' sudah digunakan pada kegiatan lain.`
      );
      return res.status(422).json(response.toResponse());
    }

    const updateData = {
      monev_activity_category_id:
        activityCategoryId ?? existing.monev_activity_category_id,
      name: name ?? existing.name,
      description: description ?? existing.description,
      location: location ?? existing.location,
      started_date: startedDate ?? existing.started_date,
      finished_date: finishedDate ?? existing.finished_date,
      started_time: startedTime ?? existing.started_time,
      finished_time: finishedTime ?? existing.finished_time,
      updated_at: trx.fn.now(),
    };

    await trx("monev_activity_calendar").where("id", id).update(updateData);

    await activityLogHelper.logUpdate(
      {
        userId: activityLogHelper.fromReq(req),
        module: "monev",
        subject: "Kegiatan Kalender",
      },
      trx
    );

    await trx.commit();

    const response = new WithoutDataResource(
      200,
      "SUCCESS_UPDATE_DATA",
      "Berhasil Memperbarui",
      `Data kegiatan '${name}' berhasil diperbarui.`
    );
    return res.status(200).json(response.toResponse());
  } catch (error) {
    await trx.rollback();
    logger.error(
      `| Activity Calendar MONEV | - Error function update : ${error.message}`
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

    const existing = await trx("monev_activity_calendar")
      .select("id", "name")
      .whereIn("id", ids)
      .whereNull("deleted_at");
    if (existing.length === 0) {
      await trx.rollback();
      const response = new WithoutDataResource(
        200,
        "DATA_NOT_FOUND",
        "Data Tidak Ditemukan",
        `Tidak ada data kegiatan yang cocok atau sudah terhapus.`
      );
      return res.status(200).json(response.toResponse());
    }

    const existingIds = existing.map((r) => r.id);

    await trx("monev_activity_calendar").whereIn("id", existingIds).update({
      deleted_at: trx.fn.now(),
    });

    await activityLogHelper.logDelete(
      {
        userId: activityLogHelper.fromReq(req),
        module: "monev",
        subject: "Kegiatan Kalender",
        // notes: `Nama = '${name}'`, // opsional bisa dicomment jika gak dipake
        // description: "override manual", // jika mau override template
      },
      trx
    );

    await trx.commit();

    const response = new WithoutDataResource(
      200,
      "SUCCESS_DELETE_DATA",
      "Berhasil Menghapus Data",
      `Berhasil menghapus (soft delete) ${existingIds.length} data kegiatan.`
    );
    return res.status(200).json(response.toResponse());
  } catch (error) {
    await trx.rollback();
    logger.error(
      `| Activity Calendar MONEV | - Error function destroy : ${error.message}`
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

    const softDeleted = await trx("monev_activity_calendar")
      .select("id", "name")
      .whereIn("id", ids)
      .whereNotNull("deleted_at");
    if (softDeleted.length === 0) {
      await trx.rollback();
      const response = new WithoutDataResource(
        200,
        "DATA_NOT_FOUND",
        "Data Tidak Ditemukan",
        `Tidak ada data kegiatan terhapus yang cocok untuk direstore.`
      );
      return res.status(200).json(response.toResponse());
    }

    // 1) Cek bentrok judul dengan entri aktif
    const namesLower = softDeleted.map((r) => r.name?.toLowerCase?.() ?? "");
    const activeWithSameTitle = await trx("monev_activity_calendar")
      .select(knex.raw("lower(name) AS lname"))
      .whereNull("deleted_at")
      .whereIn(knex.raw("lower(name)"), namesLower);

    const conflictActive = new Set(activeWithSameTitle.map((r) => r.lname));

    // 2) Cek duplikat judul di dalam batch restore sendiri
    const seenBatch = new Set();
    const duplicateInBatch = new Set();
    for (const r of softDeleted) {
      const lt = (r.name || "").toLowerCase();
      if (seenBatch.has(lt)) duplicateInBatch.add(lt);
      else seenBatch.add(lt);
    }

    // 3) Tentukan mana yang boleh direstore (tidak bentrok & bukan duplikat batch)
    const restorable = [];
    const skippedConflicts = [];
    const takenInBatch = new Set(); // untuk hanya ambil satu per name di batch

    for (const r of softDeleted) {
      const lt = (r.name || "").toLowerCase();
      const hasActiveConflict = conflictActive.has(lt);
      const hasBatchDup = duplicateInBatch.has(lt);

      if (hasActiveConflict || hasBatchDup) {
        skippedConflicts.push({ id: r.id, name: r.name });
        continue;
      }
      if (takenInBatch.has(lt)) {
        skippedConflicts.push({ id: r.id, name: r.name });
        continue;
      }
      takenInBatch.add(lt);
      restorable.push(r);
    }

    // 4) Eksekusi restore
    let restoredCount = 0;
    if (restorable.length > 0) {
      const idsToRestore = restorable.map((r) => r.id);
      await trx("monev_activity_calendar")
        .whereIn("id", idsToRestore)
        .update({ deleted_at: null, updated_at: trx.fn.now() });
      restoredCount = idsToRestore.length;
    }

    await activityLogHelper.logRestore(
      {
        userId: activityLogHelper.fromReq(req),
        module: "monev",
        subject: "Kegiatan Kalender",
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
      `| Activity Calendar MONEV | - Error function restore: ${error.message}`
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
