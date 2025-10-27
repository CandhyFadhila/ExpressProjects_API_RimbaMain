const { validationResult } = require("express-validator");
const knex = require("../../config/database");
const logger = require("../../utils/logger");
const { asJsonb } = require("../../helpers/dbJson");
const { normIdArray, normJsonbArray } = require("../../helpers/inputNorm");
const {
  applySearch,
  applyPagination,
  formatPaginationResult,
} = require("../../helpers/queryHelper");
const documentHelper = require("../../helpers/documentHelper");
const WithDataResource = require("../../resources/WithDataResource");
const WithoutDataResource = require("../../resources/WithoutDataResource");
const monevDashboardResource = require("../../resources/masterData/monevDashboardResource");
const activityLogHelper = require("../../helpers/activityLogHelper");
const { applyTrashedScope } = require("../../helpers/roleAbilityCheckHelper");
const { applyLatestThenTrashed } = require("../../helpers/queryOrderHelper");

exports.getDahsboard = async (req, res) => {
  const { id } = req.params;

  try {
    const dashboard = await knex("monev_dashboards")
      .select("*")
      .where("id", id)
      .first();
    if (!dashboard) {
      const response = new WithoutDataResource(
        200,
        "DATA_NOT_FOUND",
        "Data Tidak Ditemukan",
        `Data dashboard dengan ID '${id}' tidak ditemukan.`
      );
      return res.status(200).json(response.toResponse());
    }

    const data = await monevDashboardResource(dashboard);
    const response = new WithDataResource(
      200,
      "SUCCESS_GET_DATA",
      "Berhasil Mengambil Data",
      "Detail data dashboard berhasil didapatkan.",
      data
    );
    return res.status(200).json(response.toResponse());
  } catch (error) {
    logger.error(
      `| Dashboard MONEV | - Error function getDahsboard: ${error.message}`
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

exports.index = async (req, res) => {
  const { search } = req.query;

  try {
    let query = knex("monev_dashboards as dashboard").select("dashboard.*");

    applyTrashedScope(query, req, "dashboard.deleted_at");

    applySearch(query, search, ["dashboard.networth_hibah"]);

    applyLatestThenTrashed(
      query,
      "dashboard.deleted_at",
      "dashboard.created_at",
      "dashboard.id"
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
      result.data.map((dashboard) => monevDashboardResource(dashboard))
    );

    const response = new WithDataResource(
      200,
      "SUCCESS_GET_DATA",
      "Berhasil Mengambil Data",
      "Data dashboard berhasil diambil.",
      {
        data: serializedData,
        pagination: result.pagination,
      }
    );
    return res.status(200).json(response.toResponse());
  } catch (error) {
    logger.error(
      `| Dashboard MONEV | - Error function index : ${error.message}`
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
  const { description, hibah } = req.body;

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
    const MAX_SIZE = 10 * 1024 * 1024;

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
            `Ukuran maksimal tiap file pada ${label} adalah 10MB.`
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
        networth_hibah: hibah,
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
  const { description, hibah, deleteFrameworkFileIds, deletePlanFileIds } = req.body;
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
    const MAX_SIZE = 10 * 1024 * 1024;

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
            `Ukuran maksimal tiap file pada ${label} adalah 10MB.`
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
        networth_hibah: hibah ?? existing.networth_hibah,
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
