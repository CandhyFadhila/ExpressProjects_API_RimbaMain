const { validationResult } = require("express-validator");
const knex = require("../../config/database");
const logger = require("../../utils/logger");
const {
  applySearch,
  applyPagination,
  formatPaginationResult,
} = require("../../helpers/queryHelper");
const WithDataResource = require("../../resources/WithDataResource");
const WithoutDataResource = require("../../resources/WithoutDataResource");
const activityPackageResource = require("../../resources/monev/activityPackageResource");
const activityLogHelper = require("../../helpers/activityLogHelper");
const { applyTrashedScope } = require("../../helpers/roleAbilityCheckHelper");
const { applyLatestThenTrashed } = require("../../helpers/queryOrderHelper");

const dayjs = require("dayjs");
const utc = require("dayjs/plugin/utc");
const timezone = require("dayjs/plugin/timezone");
require("dayjs/locale/id");
dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.locale("id");

exports.index = async (req, res) => {
  const { search } = req.query;

  try {
    let query = knex("monev_activity_packages as activity").select(
      "activity.*"
    );

    applyTrashedScope(query, req, "activity.deleted_at");

    applySearch(query, search, ["activity.mak", "activity.name"]);

    applyLatestThenTrashed(
      query,
      "activity.deleted_at",
      "activity.created_at",
      "activity.id"
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
      result.data.map((activity) => activityPackageResource(activity))
    );

    const response = new WithDataResource(
      200,
      "SUCCESS_GET_DATA",
      "Berhasil Mengambil Data",
      "Data paket kegiatan berhasil diambil.",
      {
        data: serializedData,
        pagination: result.pagination,
      }
    );
    return res.status(200).json(response.toResponse());
  } catch (error) {
    logger.error(
      `| Activity Package MONEV | - Error function index : ${error.message}`
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
    picDivisionId,
    contractType,
    mak,
    name,
    description,
    startedMonth,
    finishedMonth,
    startedYear,
    finishedYear,
    unitOutput,
    codeOutput,
    volume,
    pagu,
    partner,
  } = req.body;
  const userId =
    req.auth?.userId ??
    req.auth?.user_id ??
    req.auth?.id ??
    req.userId ??
    req.user?.id;

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

    let span;
    try {
      span = enumerateMonthsByYear(
        startedMonth,
        startedYear,
        finishedMonth,
        finishedYear
      );
    } catch (e) {
      await trx.rollback();
      const response = new WithoutDataResource(
        422,
        e.code === "RANGE_INVALID" ? "INVALID_RANGE" : "INVALID_MONTH_YEAR",
        "Validasi Bulan/Tahun Gagal",
        e.message || "Rentang bulan/tahun tidak valid."
      );
      return res.status(422).json(response.toResponse());
    }

    const exists = await trx("monev_activity_packages")
      .whereRaw("lower(name) = lower(?)", [name])
      .whereNull("deleted_at")
      .first();
    if (exists) {
      await trx.rollback();
      const response = new WithoutDataResource(
        422,
        "DUPLICATE_NAME",
        "Duplikat Data",
        `Nama paket kegiatan '${name}' sudah digunakan. Silakan gunakan judul lain.`
      );
      return res.status(422).json(response.toResponse());
    }

    const [pkg] = await trx("monev_activity_packages")
      .insert({
        created_by: userId,
        monev_pic_division_id: picDivisionId,
        contract_type: contractType,
        mak,
        name,
        started_month: span.startIdx,
        finished_month: span.endIdx,
        started_year: span.startYear,
        finished_year: span.endYear,
        unit_output: unitOutput,
        code_output: codeOutput,
        volume,
        pagu,
        partner,
        description,
      })
      .returning("*");

    await autoCreateTargets(trx, pkg.id, span);
    await autoCreateMonthlyRealizations(trx, pkg.id, span);

    await activityLogHelper.logCreate(
      {
        userId: activityLogHelper.fromReq(req),
        module: "monev",
        subject: "List Aktivitas Paket Kegiatan",
      },
      trx
    );

    await trx.commit();

    const response = new WithoutDataResource(
      201,
      "SUCCESS_CREATE_DATA",
      "Berhasil Menyimpan Data",
      `Data paket kegiatan '${name}' berhasil ditambahkan.`
    );
    return res.status(201).json(response.toResponse());
  } catch (error) {
    await trx.rollback();
    logger.error(
      `| Activity Package MONEV | - Error function store: ${error.message}`
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
    const activity = await knex("monev_activity_packages")
      .select("*")
      .where("id", id)
      .first();
    if (!activity) {
      const response = new WithoutDataResource(
        200,
        "DATA_NOT_FOUND",
        "Data Tidak Ditemukan",
        `Data paket kegiatan dengan ID '${id}' tidak ditemukan.`
      );
      return res.status(200).json(response.toResponse());
    }

    const data = await activityPackageResource(activity);
    const response = new WithDataResource(
      200,
      "SUCCESS_GET_DATA",
      "Berhasil Mengambil Data",
      `Detail data paket kegiatan '${activity.name}' berhasil didapatkan.`,
      data
    );
    return res.status(200).json(response.toResponse());
  } catch (error) {
    logger.error(
      `| Activity Package MONEV | - Error function show: ${error.message}`
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
    picDivisionId,
    contractType,
    mak,
    name,
    description,
    unitOutput,
    codeOutput,
    volume,
    pagu,
    partner,
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

    const existing = await trx("monev_activity_packages")
      .where("id", id)
      .first();
    if (!existing) {
      const response = new WithoutDataResource(
        200,
        "DATA_NOT_FOUND",
        "Data Tidak Ditemukan",
        `Data paket kegiatan dengan ID '${id}' tidak ditemukan.`
      );
      return res.status(200).json(response.toResponse());
    }

    const duplicate = await trx("monev_activity_packages")
      .whereRaw("lower(name) = lower(?)", [name])
      .whereNull("deleted_at")
      .whereNot("id", id)
      .first();
    if (duplicate) {
      const response = new WithoutDataResource(
        422,
        "DUPLICATE_NAME",
        "Duplikat Data",
        `Judul '${name}' sudah digunakan pada paket kegiatan lain.`
      );
      return res.status(422).json(response.toResponse());
    }

    await trx("monev_activity_packages")
      .where("id", id)
      .update({
        monev_pic_division_id: picDivisionId ?? existing.monev_pic_division_id,
        contract_type: contractType ?? existing.contract_type,
        mak: mak ?? existing.mak,
        name: name ?? existing.name,
        unit_output: unitOutput ?? existing.unit_output,
        code_output: codeOutput ?? existing.code_output,
        volume: volume ?? existing.volume,
        pagu: pagu ?? existing.pagu,
        partner: partner ?? existing.partner,
        description: description ?? existing.description,
        updated_at: trx.fn.now(),
      });

    await activityLogHelper.logUpdate(
      {
        userId: activityLogHelper.fromReq(req),
        module: "monev",
        subject: "List Aktivitas Paket Kegiatan",
      },
      trx
    );

    await trx.commit();

    const response = new WithoutDataResource(
      200,
      "SUCCESS_UPDATE_DATA",
      "Berhasil Memperbarui",
      `Data paket kegiatan '${name}' berhasil diperbarui.`
    );
    return res.status(200).json(response.toResponse());
  } catch (error) {
    await trx.rollback();
    logger.error(
      `| Activity Package MONEV | - Error function update : ${error.message}`
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

// TODO: Nambah delete disini (hard delete)
// Hapus data secara permanen semua id monev_activity_packages terkait. Termasuk tabel monev_targets, monev_target_pending_updates, monev_monthly_realizations, monev_monthly_realization_pending_updates

// TODO: Nambah export pdf dan csv disini


const MONTHS_ID = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
];

function toMonthIndex(v) {
  const n = Number(v);
  if (!Number.isInteger(n) || n < 0 || n > 11) {
    const err = new Error("Index bulan harus 0..11.");
    err.code = "INVALID_MONTH_YEAR";
    throw err;
  }
  return n;
}

/**
 * Enumerasi bulan inklusif lintas tahun.
 * return: {
 *   items: Array<{year:number, month_index:number, month_label:string}>,
 *   startIdx, endIdx, startYear, endYear
 * }
 */
function enumerateMonthsByYear(
  startIdxInput,
  startYearInput,
  endIdxInput,
  endYearInput
) {
  const startIdx = toMonthIndex(startIdxInput);
  const endIdx = toMonthIndex(endIdxInput);
  const startYear = Number(startYearInput);
  const endYear = Number(endYearInput);

  if (!Number.isInteger(startYear) || !Number.isInteger(endYear)) {
    const err = new Error("Tahun harus berupa angka.");
    err.code = "INVALID_MONTH_YEAR";
    throw err;
  }
  if (endYear < startYear || (endYear === startYear && endIdx < startIdx)) {
    const err = new Error(
      "finished (bulan/tahun) tidak boleh < started (bulan/tahun)."
    );
    err.code = "RANGE_INVALID";
    throw err;
  }

  const items = [];
  let y = startYear;
  let m = startIdx;
  while (y < endYear || (y === endYear && m <= endIdx)) {
    items.push({ year: y, month_index: m, month_label: MONTHS_ID[m] });
    m++;
    if (m === 12) {
      m = 0;
      y++;
    }
  }

  return { items, startIdx, endIdx, startYear, endYear };
}

/** Auto-create monev_targets sesuai rentang bulan */
async function autoCreateTargets(trx, pkgId, span) {
  const rows = span.items.map(({ year, month_index }) => ({
    monev_activity_packages_id: pkgId,
    year,
    month: month_index,
  }));
  if (rows.length) {
    await trx("monev_targets").insert(rows);
  }
}

/** Auto-create monev_monthly_realizations sesuai rentang bulan */
async function autoCreateMonthlyRealizations(trx, pkgId, span) {
  const rows = span.items.map(({ year, month_index }) => ({
    monev_activity_packages_id: pkgId,
    year,
    month: month_index,
    progress: 0,
  }));
  if (rows.length) {
    await trx("monev_monthly_realizations").insert(rows);
  }
}
