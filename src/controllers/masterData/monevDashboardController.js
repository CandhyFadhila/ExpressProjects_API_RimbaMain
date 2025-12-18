const { validationResult } = require("express-validator");
const knex = require("../../config/database");
const logger = require("../../utils/logger");
const { asJsonb } = require("../../helpers/dbJson");
const { normIdArray, normJsonbArray } = require("../../helpers/inputNorm");
const documentHelper = require("../../helpers/documentHelper");
const WithDataResource = require("../../resources/WithDataResource");
const WithoutDataResource = require("../../resources/WithoutDataResource");
const monevDashboardResource = require("../../resources/masterData/monevDashboardResource");
const activityLogHelper = require("../../helpers/activityLogHelper");

exports.dashboardInfo = async (req, res) => {
  try {
    const rawYear =
      (req.query && req.query.year) ?? (req.body && req.body.year);
    const parsed = Number(rawYear);
    const targetYear =
      Number.isInteger(parsed) && parsed > 0
        ? parsed
        : new Date().getFullYear();

    const dashboard = await getDashboardInfo();
    const avgPhysicalTarget = await getAvgPhysicalTargetByYear(targetYear);
    const avgProgressRealization = await getAvgProgressRealizationByYear(
      targetYear
    );
    const totalActivityPackages = await getTotalActivityPackagesCreatedByYear(
      targetYear
    );
    const statsBudgetTarget = await getStatsBudgetTargetByYear(targetYear);
    const statsBudgetRealization = await getStatsBudgetRealizationByYear(
      targetYear
    );
    const chartBudget = await getChartBudgetByYear(targetYear);
    const chartPhysical = await getChartPhysicalByYear(targetYear);
    const sumBudgetTarget = await getSumBudgetTargetByYear(targetYear);
    const sumBudgetRealization = await getSumBudgetRealizationByYear(
      targetYear
    );
    const totalActivityCalendar = await getTotalActivityCalendarCreatedByYear(
      targetYear
    );

    const response = new WithDataResource(
      200,
      "DATA_FOUND",
      "Data Ditemukan",
      "Data dashboard MONEV berhasil didapatkan.",
      {
        dashboard,
        avgPhysicalTarget,
        avgProgressRealization,
        totalActivityPackages,
        chartBudget,
        chartPhysical,
        statsBudgetTarget,
        statsBudgetRealization,
        sumBudgetTarget,
        sumBudgetRealization,
        totalActivityCalendar,
      }
    );
    res.status(200).json(response.toResponse());
  } catch (error) {
    logger.error(
      `| Dashboard MONEV | - Error function dashboardInfo : ${error.message}`
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
  const { description, hibahIDR, hibahUSD } = req.body;

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

    const frameworkFiles = req.files?.frameworkFiles || [];
    const planFiles = req.files?.planFiles || [];

    const MIME_ALIAS = {
      "application/pdf": "PDF",
    };
    const DOC_TYPES = ["application/pdf"];
    const MAX_SIZE = 50 * 1024 * 1024;

    const toExtList = (mimes) =>
      [...new Set(mimes.map((m) => MIME_ALIAS[m] || m))].join(", ");

    const checkFiles = (files, allowed, label) => {
      const allowedExts = toExtList(allowed);
      for (const f of files) {
        if (!allowed.includes(f.mimetype)) {
          throw new WithoutDataResource(
            422,
            "INVALID_FILE_TYPE",
            "Tipe File Salah",
            `${label} harus berformat: ${allowedExts}.`
          );
        }
        if (f.size > MAX_SIZE) {
          throw new WithoutDataResource(
            422,
            "FILE_TOO_LARGE",
            "Ukuran File Terlalu Besar",
            `Ukuran maksimal tiap file pada ${label} adalah 50mB.`
          );
        }
      }
      return null;
    };

    if (frameworkFiles.length === 0) {
      const r = new WithoutDataResource(
        422,
        "FILES_NOT_FOUND",
        "File Tidak Ditemukan",
        "Berkas file dashboard framework wajib diunggah."
      );
      return res.status(422).json(r.toResponse());
    }
    checkFiles(frameworkFiles, DOC_TYPES, "Berkas file framework");

    if (planFiles.length === 0) {
      const r = new WithoutDataResource(
        422,
        "FILES_NOT_FOUND",
        "File Tidak Ditemukan",
        "Berkas file dashboard plan wajib diunggah."
      );
      return res.status(422).json(r.toResponse());
    }
    checkFiles(planFiles, DOC_TYPES, "Berkas file plan");

    if (frameworkFiles.length > 1) {
      const response = new WithoutDataResource(
        422,
        "MAX_FILES",
        "Terlalu Banyak File",
        "Maksimal upload file framework per request adalah 1 file."
      );
      return res.status(200).json(response.toResponse());
    }

    if (planFiles.length > 1) {
      const response = new WithoutDataResource(
        422,
        "MAX_FILES",
        "Terlalu Banyak File",
        "Maksimal upload file plan per request adalah 1 file."
      );
      return res.status(200).json(response.toResponse());
    }

    let uploadedFrameworkIds = [];
    let uploadedPlanIds = [];
    if (frameworkFiles.length > 0) {
      uploadedFrameworkIds = await documentHelper.uploadDocuments(
        frameworkFiles,
        req
      );
    }
    if (planFiles.length > 0) {
      uploadedPlanIds = await documentHelper.uploadDocuments(planFiles, req);
    }
    const frameworkFromBody = normIdArray(req.body.frameworkFiles, {
      as: "number",
    });
    const planFromBody = normIdArray(req.body.planFiles, {
      as: "number",
    });
    const frameworkIds = frameworkFromBody.length
      ? frameworkFromBody
      : uploadedFrameworkIds;
    const planIds = planFromBody.length ? planFromBody : uploadedPlanIds;

    await trx("monev_dashboards")
      .insert({
        networth_hibah_usd: hibahUSD,
        networth_hibah_idr: hibahIDR,
        description,
        framework_file_ids: frameworkIds?.length ? asJsonb(frameworkIds) : null,
        plan_file_ids: planIds?.length ? asJsonb(planIds) : null,
      })
      .returning("*");

    await activityLogHelper.logCreate(
      {
        userId: activityLogHelper.fromReq(req),
        module: "master_data",
        subject: "Dashboard Monev",
      },
      trx
    );

    await trx.commit();

    const response = new WithoutDataResource(
      201,
      "SUCCESS_CREATE_DATA",
      "Berhasil Menyimpan Data",
      "Data dashboard berhasil ditambahkan."
    );
    return res.status(201).json(response.toResponse());
  } catch (error) {
    await trx.rollback();
    if (error && typeof error.toResponse === "function") {
      const status = error.status || error.statusCode || 422;
      return res.status(status).json(error.toResponse());
    }

    // Error umum
    logger.error(
      `| Dashboard MONEV | - Error function store: ${
        error?.message || String(error)
      }`
    );
    const response = new WithoutDataResource(
      500,
      "SERVER_ERROR",
      "Server Sedang Error",
      "Terjadi kesalahan pada sistem, silahkan coba lagi nanti atau hubungi admin."
    );
    return res.status(500).json(response.toResponse());
  }
};

exports.update = async (req, res) => {
  const trx = await knex.transaction();
  const {
    description,
    hibahUSD,
    hibahIDR,
    deleteFrameworkFileIds,
    deletePlanFileIds,
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

    const existing = await trx("monev_dashboards").where("id", id).first();
    if (!existing) {
      const response = new WithoutDataResource(
        200,
        "DATA_NOT_FOUND",
        "Data Tidak Ditemukan",
        `Data dashboard dengan ID '${id}' tidak ditemukan.`
      );
      return res.status(200).json(response.toResponse());
    }

    const frameworkFiles = req.files?.frameworkFiles || [];
    const planFiles = req.files?.planFiles || [];

    const MIME_ALIAS = {
      "application/pdf": "PDF",
    };

    const DOC_TYPES = ["application/pdf"];
    const MAX_SIZE = 50 * 1024 * 1024;

    const toExtList = (mimes) =>
      [...new Set(mimes.map((m) => MIME_ALIAS[m] || m))].join(", ");

    const checkFiles = (files, allowed, label) => {
      const allowedExts = toExtList(allowed);
      for (const f of files) {
        if (!allowed.includes(f.mimetype)) {
          throw new WithoutDataResource(
            422,
            "INVALID_FILE_TYPE",
            "Tipe File Salah",
            `${label} harus berformat: ${allowedExts}.`
          );
        }
        if (f.size > MAX_SIZE) {
          throw new WithoutDataResource(
            422,
            "FILE_TOO_LARGE",
            "Ukuran File Terlalu Besar",
            `Ukuran maksimal tiap file pada ${label} adalah 50mB.`
          );
        }
      }
      return null;
    };

    if (frameworkFiles.length > 0) {
      const err = checkFiles(
        frameworkFiles,
        DOC_TYPES,
        "File (frameworkFiles)"
      );
      if (err) return res.status(422).json(err.toResponse());
      if (frameworkFiles.length > 1) {
        const response = new WithoutDataResource(
          422,
          "MAX_FILES",
          "Terlalu Banyak File",
          "Maksimal upload file framework per request adalah 1 file."
        );
        return res.status(200).json(response.toResponse());
      }
    }
    if (planFiles.length > 0) {
      const err = checkFiles(planFiles, DOC_TYPES, "File (planFiles)");
      if (err) return res.status(422).json(err.toResponse());
      if (planFiles.length > 1) {
        const response = new WithoutDataResource(
          422,
          "MAX_FILES",
          "Terlalu Banyak File",
          "Maksimal upload file plan per request adalah 1 file."
        );
        return res.status(200).json(response.toResponse());
      }
    }

    // ===== siapkan list lama =====
    const oldFrameworkIds = normIdArray(
      normJsonbArray(existing.framework_file_ids),
      { as: "number" }
    );
    const oldPlanIds = normIdArray(normJsonbArray(existing.plan_file_ids), {
      as: "number",
    });

    // ===== hapus sesuai request =====
    const delFramework = normIdArray(deleteFrameworkFileIds, { as: "number" });
    const delPlan = normIdArray(deletePlanFileIds, { as: "number" });

    let newFrameworkIds = oldFrameworkIds.filter(
      (x) => !delFramework.includes(x)
    );
    let newPlanIds = oldPlanIds.filter((x) => !delPlan.includes(x));

    // ===== upload baru (append) =====
    let uploadedFrameworkIds = [];
    let uploadedPlanIds = [];
    if (frameworkFiles.length > 0) {
      uploadedFrameworkIds = normIdArray(
        await documentHelper.uploadDocuments(frameworkFiles, req),
        { as: "number" }
      );
    }
    if (planFiles.length > 0) {
      uploadedPlanIds = normIdArray(
        await documentHelper.uploadDocuments(planFiles, req),
        { as: "number" }
      );
    }

    const addFrameworkFromBody = normIdArray(frameworkFiles, { as: "number" });
    const addPlanFromBody = normIdArray(planFiles, { as: "number" });

    const uniq = (arr) => Array.from(new Set(arr.filter((v) => v != null)));

    newFrameworkIds = uniq([
      ...newFrameworkIds,
      ...addFrameworkFromBody,
      ...uploadedFrameworkIds,
    ]);
    newPlanIds = uniq([...newPlanIds, ...addPlanFromBody, ...uploadedPlanIds]);

    await trx("monev_dashboards")
      .where("id", id)
      .update({
        networth_hibah_usd: hibahUSD ?? existing.networth_hibah_usd,
        networth_hibah_idr: hibahIDR ?? existing.networth_hibah_idr,
        description: description ?? existing.description,
        framework_file_ids: asJsonb(newFrameworkIds),
        plan_file_ids: asJsonb(newPlanIds),
        updated_at: trx.fn.now(),
      });

    await activityLogHelper.logCreate(
      {
        userId: activityLogHelper.fromReq(req),
        module: "master_data",
        subject: "Dashboard Monev",
      },
      trx
    );

    await trx.commit();

    const willDelete = [...delFramework, ...delPlan].filter((n) =>
      Number.isFinite(n)
    );
    if (willDelete.length) {
      try {
        await documentHelper.deleteDocuments(willDelete);
      } catch (e) {
        logger?.error?.(
          `| Dashboard MONEV | - Gagal hapus dokumen: ${e.message}`
        );
      }
    }

    const response = new WithoutDataResource(
      200,
      "SUCCESS_UPDATE_DATA",
      "Berhasil Memperbarui",
      "Data dashboard berhasil diperbarui."
    );
    return res.status(200).json(response.toResponse());
  } catch (error) {
    await trx.rollback();
    if (error && typeof error.toResponse === "function") {
      const status = error.status || error.statusCode || 422;
      return res.status(status).json(error.toResponse());
    }

    logger.error(
      `| Dashboard MONEV | - Error function update : ${error.message}`
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

function buildZeroMonthStats() {
  return Array.from({ length: 12 }, (_, i) => ({ month: i, value: 0 }));
}

function buildZeroChartBudget() {
  return Array.from({ length: 12 }, (_, i) => ({
    month: i,
    target: 0,
    realization: 0,
  }));
}

function buildZeroChartPhysical() {
  return Array.from({ length: 12 }, (_, i) => ({
    month: i,
    target: 0,
    realization: 0,
  }));
}

async function getAvgPhysicalTargetByYear(year) {
  const row = await knex("monev_targets as mt")
    .where("mt.year", year)
    .whereNull("mt.deleted_at")
    .select(
      knex.raw("COALESCE(AVG(mt.physical_target), 0) AS avg_physical_target")
    )
    .first();

  const avg = Number(row?.avg_physical_target ?? 0);
  return Math.round(avg * 100) / 100;
}

async function getAvgProgressRealizationByYear(year) {
  const row = await knex("monev_monthly_realizations as mmr")
    .where("mmr.year", year)
    .whereNull("mmr.deleted_at")
    .select(
      knex.raw(
        "COALESCE(AVG(LEAST(GREATEST(mmr.progress, 0), 100)), 0) AS avg_progress"
      )
    )
    .first();

  const avg = Number(row?.avg_progress ?? 0);
  return Math.round(avg * 100) / 100;
}

async function getTotalActivityPackagesCreatedByYear(year) {
  const startStr = `${year}-01-01 00:00:00`;
  const endStr = `${year + 1}-01-01 00:00:00`;

  const row = await knex("monev_activity_packages as map")
    .whereNull("map.deleted_at")
    .andWhere("map.created_at", ">=", startStr)
    .andWhere("map.created_at", "<", endStr)
    .count({ total: "*" })
    .first();

  return Number(row?.total ?? 0);
}

async function getStatsBudgetTargetByYear(year) {
  const rows = await knex("monev_targets as mt")
    .where("mt.year", year)
    .whereNull("mt.deleted_at")
    .select("mt.month")
    .select(knex.raw("COALESCE(SUM((mt.budget_target)::bigint), 0) AS total"))
    .groupBy("mt.month")
    .orderBy("mt.month", "asc");

  const byMonth = new Map(rows.map((r) => [Number(r.month), Number(r.total)]));

  const stats = buildZeroMonthStats();
  for (let i = 0; i < 12; i++) {
    stats[i].value = byMonth.get(i + 1) ?? 0;
  }
  return stats;
}

async function getStatsBudgetRealizationByYear(year) {
  const rows = await knex("monev_monthly_realizations as mmr")
    .where("mmr.year", year)
    .whereNull("mmr.deleted_at")
    .joinRaw(
      "LEFT JOIN LATERAL jsonb_array_elements(COALESCE(mmr.budget_realization, '[]'::jsonb)) AS elem ON TRUE"
    )
    .select("mmr.month")
    .select(
      knex.raw(
        "COALESCE(SUM(GREATEST((elem->>'value')::bigint, 0)), 0) AS total"
      )
    )
    .groupBy("mmr.month")
    .orderBy("mmr.month", "asc");

  const byMonth = new Map(rows.map((r) => [Number(r.month), Number(r.total)]));

  const stats = buildZeroMonthStats();
  for (let i = 0; i < 12; i++) {
    stats[i].value = byMonth.get(i + 1) ?? 0;
  }
  return stats;
}

/**
 * getChartBudgetByYear
 * Menghasilkan chartBudget: target (SUM budget_target) vs realization (SUM budget_realization[].value) per bulan pada tahun tertentu.
 */
async function getChartBudgetByYear(year) {
  const targetRows = await knex("monev_targets as mt")
    .where("mt.year", year)
    .whereNull("mt.deleted_at")
    .select("mt.month")
    .select(knex.raw("COALESCE(SUM((mt.budget_target)::bigint), 0) AS total"))
    .groupBy("mt.month");

  const realizationRows = await knex("monev_monthly_realizations as mmr")
    .where("mmr.year", year)
    .whereNull("mmr.deleted_at")
    .joinRaw(
      "LEFT JOIN LATERAL jsonb_array_elements(COALESCE(mmr.budget_realization, '[]'::jsonb)) AS elem ON TRUE"
    )
    .select("mmr.month")
    .select(
      knex.raw(
        "COALESCE(SUM(GREATEST((elem->>'value')::bigint, 0)), 0) AS total"
      )
    )
    .groupBy("mmr.month");

  const targetByMonth = new Map(
    targetRows.map((r) => [Number(r.month), Number(r.total)])
  );
  const realizationByMonth = new Map(
    realizationRows.map((r) => [Number(r.month), Number(r.total)])
  );

  const chart = buildZeroChartBudget();
  for (let i = 0; i < 12; i++) {
    chart[i].target = targetByMonth.get(i + 1) ?? 0;
    chart[i].realization = realizationByMonth.get(i + 1) ?? 0;
  }

  return chart;
}

/**
 * getChartPhysicalByYear
 * Menghasilkan chartPhysical: target (AVG physical_target) vs realization (AVG progress) per bulan pada tahun tertentu.
 */
async function getChartPhysicalByYear(year) {
  const targetRows = await knex("monev_targets as mt")
    .where("mt.year", year)
    .whereNull("mt.deleted_at")
    .select("mt.month")
    .select(
      knex.raw(
        "COALESCE(AVG(LEAST(GREATEST(mt.physical_target, 0), 100)), 0) AS total"
      )
    )
    .groupBy("mt.month");

  const realizationRows = await knex("monev_monthly_realizations as mmr")
    .where("mmr.year", year)
    .whereNull("mmr.deleted_at")
    .select("mmr.month")
    .select(
      knex.raw(
        "COALESCE(AVG(LEAST(GREATEST(mmr.progress, 0), 100)), 0) AS total"
      )
    )
    .groupBy("mmr.month");

  const round2 = (n) => Math.round(Number(n) * 100) / 100;

  const targetByMonth = new Map(
    targetRows.map((r) => [Number(r.month), round2(r.total)])
  );
  const realizationByMonth = new Map(
    realizationRows.map((r) => [Number(r.month), round2(r.total)])
  );

  const chart = buildZeroChartPhysical();
  for (let i = 0; i < 12; i++) {
    chart[i].target = targetByMonth.get(i + 1) ?? 0;
    chart[i].realization = realizationByMonth.get(i + 1) ?? 0;
  }

  return chart;
}

async function getSumBudgetTargetByYear(year) {
  const row = await knex("monev_targets as mt")
    .where("mt.year", year)
    .whereNull("mt.deleted_at")
    .select(
      knex.raw("COALESCE(SUM(mt.budget_target), 0) AS total_budget_target")
    )
    .first();

  return Number(row?.total_budget_target ?? 0);
}

async function getSumBudgetRealizationByYear(year) {
  const row = await knex("monev_monthly_realizations as mmr")
    .where("mmr.year", year)
    .whereNull("mmr.deleted_at")
    .joinRaw(
      "LEFT JOIN LATERAL jsonb_array_elements(COALESCE(mmr.budget_realization,'[]'::jsonb)) AS elem ON TRUE"
    )
    .select(
      knex.raw(
        "COALESCE(SUM(GREATEST((elem->>'value')::bigint, 0)), 0) AS total_realization"
      )
    )
    .first();

  return Number(row?.total_realization ?? 0);
}

async function getTotalActivityCalendarCreatedByYear(year) {
  const startStr = `${year}-01-01 00:00:00`;
  const endStr = `${year + 1}-01-01 00:00:00`;

  const row = await knex("monev_activity_calendar as mac")
    .whereNull("mac.deleted_at")
    .andWhere("mac.created_at", ">=", startStr)
    .andWhere("mac.created_at", "<", endStr)
    .count({ total: "*" })
    .first();

  return Number(row?.total ?? 0);
}

async function getDashboardInfo() {
  const dashboard = await knex("monev_dashboards")
    .select("*")
    .where("id", 1)
    .first();
  if (!dashboard) return null;

  const data = await monevDashboardResource(dashboard);
  return data;
}
