const { validationResult } = require("express-validator");
const knex = require("../../config/database");
const logger = require("../../utils/logger");
const {
  applySearch,
  applyPagination,
  formatPaginationResult,
} = require("../../helpers/queryHelper");
const dateHelper = require("../../helpers/dateHelper");
const WithDataResource = require("../../resources/WithDataResource");
const WithoutDataResource = require("../../resources/WithoutDataResource");
const activityPackageResource = require("../../resources/monev/activityPackageResource");
const activityLogHelper = require("../../helpers/activityLogHelper");
// const { applyTrashedScope } = require("../../helpers/roleAbilityCheckHelper");
const { applyLatestThenTrashed } = require("../../helpers/queryOrderHelper");

const dayjs = require("dayjs");
const utc = require("dayjs/plugin/utc");
const timezone = require("dayjs/plugin/timezone");
require("dayjs/locale/id");
dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.locale("id");

const path = require("path");
const fs = require("fs");
const fsp = fs.promises;
const PDFDocument = require("pdfkit");
const archiver = require("archiver");
const BASE_TEMP_DIR = path.resolve(
  process.cwd(),
  "src",
  "public",
  "storage",
  "documents",
  "temp"
);

const slugify = (s) =>
  String(s || "export")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

const ymToAbs = ({ y, m }) => y * 12 + m;

exports.index = async (req, res) => {
  const { search } = req.query;

  try {
    let query = knex("monev_activity_packages as activity").select(
      "activity.*"
    );

    // applyTrashedScope(query, req, "activity.deleted_at");

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

exports.export = async (req, res) => {
  const { startDate, endDate } = req.query;

  try {
    // 1) Filter rentang (opsional)
    let filterStartAbs = null;
    let filterEndAbs = null;
    if (startDate || endDate) {
      const sYM = toYM(startDate || endDate);
      const eYM = toYM(endDate || startDate);
      if (!sYM || !eYM) {
        const response = new WithoutDataResource(
          422,
          "INVALID_DATE",
          "Validasi Tanggal Gagal",
          "Format tanggal tidak valid. Gunakan ISO Z/offset atau YYYY-MM-DD."
        );
        return res.status(422).json(response.toResponse());
      }
      filterStartAbs = Math.min(ymToAbs(sYM), ymToAbs(eYM));
      filterEndAbs = Math.max(ymToAbs(sYM), ymToAbs(eYM));
    }

    // 2) Ambil semua paket (overlap dengan rentang jika ada)
    const q = knex("monev_activity_packages")
      .select("*")
      .whereNull("deleted_at");
    if (filterStartAbs != null && filterEndAbs != null) {
      q.whereRaw(
        '(COALESCE("finished_year","started_year")*12 + COALESCE("finished_month","started_month")) >= ?',
        [filterStartAbs]
      ).whereRaw('("started_year"*12 + "started_month") <= ?', [filterEndAbs]);
    }
    const rows = await q.orderBy([
      { column: "started_year", order: "asc" },
      { column: "started_month", order: "asc" },
      { column: "id", order: "asc" },
    ]);

    // 3) Build resource dan flatten 3 field + N/A
    const resources = await Promise.all(
      rows.map((r) => activityPackageResource(r))
    );
    const exportList = resources.map(
      ({
        // Pengecualian
        target,
        monthlyRealization,
        createdAt,
        updatedAt,
        deletedAt,
        sumBudgetRealization,
        avgProgress,
        ...flat
      }) => {
        const createdUserName = flat.createdUser?.name ?? "N/A";
        const editedUserName = flat.editedUser?.name ?? "N/A";
        const picDivisionTitle = flat.picDivision?.title ?? "N/A";
        const base = {
          ...flat,
          createdUser: createdUserName,
          editedUser: editedUserName,
          picDivision: picDivisionTitle,
          startedMonth: monthIdxToLabel(flat.startedMonth),
          finishedMonth: monthIdxToLabel(flat.finishedMonth),
        };
        // Pastikan semua nilai non-null; string kosong -> "N/A"
        for (const k of Object.keys(base)) {
          base[k] = normalizeCell(base[k]);
        }
        return base;
      }
    );

    // 4) Siapkan temp dir + file path
    const baseName = `activity-packages${
      startDate || endDate
        ? "-" + slugify(`${startDate || ""}-${endDate || ""}`)
        : ""
    }`;
    const folderName = `${Date.now()}-${slugify(baseName)}`;
    const tempDir = path.join(BASE_TEMP_DIR, folderName);
    await ensureTempDir(tempDir);

    const csvPath = path.join(tempDir, `${baseName}.csv`);
    const pdfPath = path.join(tempDir, `${baseName}.pdf`);

    // 5) Buat CSV & PDF
    await createCSV(exportList, csvPath);
    await createPDF(exportList, pdfPath);

    // 6) Siapkan header download ZIP
    const zipFilename = `${baseName}.zip`;
    res.setHeader("Content-Type", "application/zip");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${zipFilename}"`
    );

    // Cleanup harus didaftarkan SEBELUM streaming dimulai
    let cleaned = false;
    const cleanupOnce = async () => {
      if (cleaned) return;
      cleaned = true;
      try {
        await cleanupTempDir(tempDir);
      } catch (e) {
        logger.warn(`| Export Cleanup | gagal hapus temp dir: ${e.message}`);
      }
    };
    res.once("finish", cleanupOnce);
    res.once("close", cleanupOnce);

    // 7) Zip & stream ke response
    await zipFilesToResponse([csvPath, pdfPath], res);
  } catch (error) {
    logger.error(
      `| Activity Package MONEV | - Error function export: ${error.message}`
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

/** Helper untuk export */
function toYM(dateString) {
  if (!dateString) return null;
  const dUTC = dateHelper._internals?.parseToUTC
    ? dateHelper._internals.parseToUTC(dateString) // dayjs.utc instance
    : null;
  if (!dUTC || !dUTC.isValid()) return null;
  const dWIB = dUTC.tz("Asia/Jakarta");
  return { y: dWIB.year(), m: dWIB.month() }; // month: 0..11
}

function monthIdxToLabel(v) {
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 && n <= 11 ? MONTHS_ID[n] : "N/A";
}

/**
 * Membuat CSV dari object "flat" exportData.
 * - Object nested akan di-JSON.stringify agar tetap "sesuai resource".
 * - Hanya 1 record per file (sesuai kebutuhan export detail).
 */
async function createCSV(list, outPath) {
  let headers = [];
  if (Array.isArray(list) && list.length > 0) {
    const set = new Set();
    list.forEach((obj) => Object.keys(obj || {}).forEach((k) => set.add(k)));
    set.delete("id"); // buang id
    const rest = Array.from(set);
    headers = ["No", ...rest];
  } else {
    headers = ["No", "info"];
    list = [{ info: "N/A" }];
  }

  const headerLine = headers.map(csvQuote).join(",");
  const lines = [headerLine];

  for (let i = 0; i < list.length; i++) {
    const row = list[i] || {};
    const values = headers.map((k) => {
      if (k === "No") return csvQuote(String(i + 1)); // penomoran
      return csvQuote(normalizeCell(row?.[k]));
    });
    lines.push(values.join(","));
  }

  await fsp.writeFile(outPath, lines.join("\n") + "\n", "utf8");
}

function csvQuote(s) {
  const escaped = String(s).replace(/"/g, '""');
  return `"${escaped}"`;
}

/**
 * PDF A3 Landscape berisi key-value dari exportData (tanpa target & monthlyRealization).
 * Layout sederhana dua kolom agar muat.
 */
async function createPDF(list, outPath) {
  await new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A3",
      layout: "landscape",
      margins: { top: 36, bottom: 36, left: 16, right: 16 },
    });
    const stream = fs.createWriteStream(outPath);
    doc.pipe(stream);

    doc
      .font("Helvetica-Bold")
      .fontSize(16)
      .text("Paket Kegiatan", { align: "left" });
    doc.moveDown(0.5);

    if (!Array.isArray(list) || list.length === 0) {
      doc.font("Helvetica").fontSize(10).text("N/A");
      doc.end();
      stream.on("finish", resolve);
      stream.on("error", reject);
      doc.on("error", reject);
      return;
    }

    // Header = union keys - id, lalu prepend "No"
    const headerSet = new Set();
    for (const obj of list)
      Object.keys(obj || {}).forEach((k) => headerSet.add(k));
    headerSet.delete("id");
    const headers = ["No", ...Array.from(headerSet)];

    // Geometry
    const marginL = doc.page.margins.left;
    const marginR = doc.page.margins.right;
    const marginT = doc.page.margins.top;
    const marginB = doc.page.margins.bottom;
    const contentW = doc.page.width - marginL - marginR;
    const padding = 6;
    const minRowH = 18;

    // === FIX: Kolom "No" dibuat kecil, sisanya dibagi merata ===
    const noIdx = headers.indexOf("No"); // harus 0
    const NO_WIDTH = 42; // kecil (±0.58 inch), muat 3 digit
    const MIN_OTHER = 70;

    // bagi rata ke selain "No"
    const othersCount = headers.length - 1;
    let baseW = Math.floor((contentW - NO_WIDTH) / Math.max(1, othersCount));
    baseW = Math.max(MIN_OTHER, baseW);

    let colWidths = headers.map((_, i) => (i === noIdx ? NO_WIDTH : baseW));

    // stretch kolom terakhir agar total = contentW
    const sumW = colWidths.reduce((a, b) => a + b, 0);
    const diff = contentW - sumW;
    if (Math.abs(diff) > 0) {
      // cari kolom terlebar selain "No"
      let idxMax =
        noIdx === headers.length - 1 ? headers.length - 2 : headers.length - 1;
      for (let i = 0; i < colWidths.length; i++) {
        if (i !== noIdx && colWidths[i] > colWidths[idxMax]) idxMax = i;
      }
      colWidths[idxMax] += diff;
    }

    // Mulai tabel
    doc.fontSize(9).font("Helvetica");
    let cursorY = doc.y + 8;
    const startX = marginL;

    cursorY = drawTableHeader(
      doc,
      startX,
      cursorY,
      headers,
      colWidths,
      padding,
      noIdx
    );

    // rows
    for (let i = 0; i < list.length; i++) {
      const row = list[i] || {};
      const values = headers.map((h) =>
        h === "No" ? String(i + 1) : normalizeCell(row[h])
      );

      const cellHeights = values.map((val, idx) =>
        Math.max(
          minRowH,
          doc.heightOfString(val, { width: colWidths[idx] - padding * 2 }) +
            padding * 2
        )
      );
      const rowH = Math.max(...cellHeights);

      if (cursorY + rowH > doc.page.height - marginB) {
        doc.addPage({
          size: "A3",
          layout: "landscape",
          margins: { top: 36, bottom: 36, left: 16, right: 16 },
        });
        cursorY = marginT;
        cursorY = drawTableHeader(
          doc,
          startX,
          cursorY,
          headers,
          colWidths,
          padding,
          noIdx
        );
      }

      cursorY = drawTableRow(
        doc,
        startX,
        cursorY,
        values,
        colWidths,
        rowH,
        padding,
        i,
        noIdx
      );
    }

    doc.end();
    stream.on("finish", resolve);
    stream.on("error", reject);
    doc.on("error", reject);
  });
}

function drawTableHeader(doc, x, y, headers, colWidths, padding, noIdx = -1) {
  const headerH = 22;
  let cursorX = x;

  doc.save();
  doc
    .rect(
      x,
      y,
      colWidths.reduce((a, b) => a + b, 0),
      headerH
    )
    .fill("#f2f2f2");
  doc.restore();

  doc.font("Helvetica-Bold").fillColor("black").fontSize(9);
  for (let i = 0; i < headers.length; i++) {
    doc.rect(cursorX, y, colWidths[i], headerH).stroke();
    doc.text(headers[i], cursorX + padding, y + (padding - 1), {
      width: colWidths[i] - padding * 2,
      ellipsis: true,
      align: i === noIdx ? "center" : "left",
    });
    cursorX += colWidths[i];
  }
  return y + headerH;
}

function drawTableRow(
  doc,
  x,
  y,
  values,
  colWidths,
  rowH,
  padding,
  idx,
  noIdx = -1
) {
  let cursorX = x;

  if (idx % 2 === 1) {
    doc.save();
    doc
      .rect(
        x,
        y,
        colWidths.reduce((a, b) => a + b, 0),
        rowH
      )
      .fill("#fbfbfb");
    doc.restore();
  }

  doc.font("Helvetica").fillColor("black").fontSize(9);
  for (let i = 0; i < values.length; i++) {
    doc.rect(cursorX, y, colWidths[i], rowH).stroke();
    doc.text(values[i], cursorX + padding, y + padding, {
      width: colWidths[i] - padding * 2,
      height: rowH - padding * 2,
      align: i === noIdx ? "center" : "left",
    });
    cursorX += colWidths[i];
  }
  return y + rowH;
}

function injectSoftWrap(str, chunk = 28) {
  if (!str) return str;
  const s = String(str);

  if (s === "N/A" || s.length < chunk) return s;

  let out = s;

  const re = new RegExp(`([^\\s]{${chunk}})(?=[^\\s])`, "g");
  out = out.replace(re, "$1\u200B");

  if (s.length >= chunk * 2) {
    out = out.replace(/([\/_.-])(?!\u200B)/g, "$1\u200B");
  }
  return out;
}

function normalizeCell(v) {
  if (v == null) return "N/A";
  if (typeof v === "string" && v.trim() === "") return "N/A";

  if (typeof v === "object") {
    try {
      return injectSoftWrap(JSON.stringify(v));
    } catch {
      return "N/A";
    }
  }
  return injectSoftWrap(String(v));
}

/**
 * Me-zip file-file dan langsung stream ke response.
 * Tidak menyimpan ZIP di disk (lebih efisien); cleanup dilakukan di 'finish' di controller.
 */
async function zipFilesToResponse(filePaths, res) {
  await new Promise((resolve, reject) => {
    const archive = archiver("zip", { zlib: { level: 9 } });
    archive.on("error", reject);
    res.on("close", resolve);

    archive.pipe(res);
    for (const p of filePaths) {
      archive.file(p, { name: path.basename(p) });
    }
    archive.finalize();
  });
}

async function ensureTempDir(dirPath) {
  await fsp.mkdir(dirPath, { recursive: true });
  return dirPath;
}
async function cleanupTempDir(dirPath) {
  await fsp.rm(dirPath, { recursive: true, force: true });
}
