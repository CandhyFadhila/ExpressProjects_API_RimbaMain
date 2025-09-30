const knex = require("../../config/database");
const logger = require("../../utils/logger");
const {
  applySearch,
  applyJsonbSearch,
  applyRelationIn,
  applyStartEndDateFilter,
  validateDateRangeRequiredBoth,
  applyPagination,
  formatPaginationResult,
} = require("../../helpers/queryHelper");
const { normIdArray, isPlainObject } = require("../../helpers/inputNorm");
const WithDataResource = require("../../resources/WithDataResource");
const WithoutDataResource = require("../../resources/WithoutDataResource");
const UserResource = require("../../resources/auth/UserResource");
const RoleResource = require("../../resources/auth/RoleResource");
const categoryResource = require("../../resources/kmis/categoryResource");
const topicResource = require("../../resources/kmis/topicResource");
const materialResource = require("../../resources/kmis/materialResource");
const quizResource = require("../../resources/kmis/quizResource");
const newsCategoryResource = require("../../resources/masterData/newsCategoryResource");
const newsResource = require("../../resources/cms/newsResource");
const eventCategoryResource = require("../../resources/masterData/eventCategoryResource");
const eventResource = require("../../resources/cms/eventResource");
const animalCategoryResource = require("../../resources/masterData/animalCategoryResource");
const contentResource = require("../../resources/cms/contentResource");
const animalCompositionResource = require("../../resources/cms/animalCompositionResource");
const legalDocumentResource = require("../../resources/cms/legalDocumentResource");

// Role
exports.getAllRole = async (req, res) => {
  const { search } = req.query;

  try {
    let query = knex("roles as role")
      .select(["role.name", "role.description"])
      .whereNot("role.id", 1) // Skip super admin
      .whereNull("role.deleted_at")
      .orderBy("role.created_at", "desc");

    applySearch(query, search, ["role.name"]);

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
      result.data.map((role) => RoleResource(role))
    );

    const response = new WithDataResource(
      200,
      "SUCCESS_GET_DATA",
      "Berhasil Mengambil Data",
      "Data role berhasil diambil.",
      {
        data: serializedData,
        pagination: result.pagination,
      }
    );
    return res.status(200).json(response.toResponse());
  } catch (error) {
    logger.error(
      `| Public Request | - Error function getAllRole : ${error.message}`
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

// Category
exports.getAllCategory = async (req, res) => {
  const { search } = req.query;

  try {
    let query = knex("kmis_categories as category")
      .select([
        "category.title",
        "category.category_cover_ids",
        "category.description",
      ])
      .whereNull("category.deleted_at")
      .orderBy("category.created_at", "desc");

    applySearch(query, search, ["category.title"]);

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
      result.data.map((category) => categoryResource(category))
    );

    const response = new WithDataResource(
      200,
      "SUCCESS_GET_DATA",
      "Berhasil Mengambil Data",
      "Data kategori berhasil diambil.",
      {
        data: serializedData,
        pagination: result.pagination,
      }
    );
    return res.status(200).json(response.toResponse());
  } catch (error) {
    logger.error(
      `| Public Request | - Error function getAllCategory : ${error.message}`
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

exports.getCategorybyId = async (req, res) => {
  const { id } = req.params;

  try {
    const category = await knex("kmis_categories")
      .select(["title", "category_cover_ids", "description"])
      .where("id", id)
      .whereNull("deleted_at")
      .first();
    if (!category) {
      const response = new WithoutDataResource(
        200,
        "DATA_NOT_FOUND",
        "Data Tidak Ditemukan",
        `Data kategori dengan ID '${id}' tidak ditemukan.`
      );
      return res.status(200).json(response.toResponse());
    }

    const data = await categoryResource(category);
    const response = new WithDataResource(
      200,
      "SUCCESS_GET_DATA",
      "Berhasil Mengambil Data",
      `Detail data kategori '${category.title}' berhasil didapatkan.`,
      data
    );
    return res.status(200).json(response.toResponse());
  } catch (error) {
    logger.error(
      `| Public Request | - Error function getCategorybyId: ${error.message}`
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

// Topic
exports.getAllTopic = async (req, res) => {
  const { search, categoryId } = req.query;

  try {
    let query = knex("kmis_topics as topic")
      .select([
        "topic.kmis_categories_id",
        "topic.topic_cover_ids",
        "topic.title",
        "topic.description",
        "topic.total_quiz",
      ])
      .leftJoin(
        "kmis_categories as category",
        "topic.kmis_categories_id",
        "category.id"
      )
      .whereNull("topic.deleted_at")
      .orderBy("topic.created_at", "desc");

    applyRelationIn(query, "topic.kmis_categories_id", categoryId, {
      as: "number",
    });

    applySearch(query, search, ["topic.title", "category.title"]);

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
      result.data.map((topic) => topicResource(topic))
    );

    const response = new WithDataResource(
      200,
      "SUCCESS_GET_DATA",
      "Berhasil Mengambil Data",
      "Data topik berhasil diambil.",
      {
        data: serializedData,
        pagination: result.pagination,
      }
    );
    return res.status(200).json(response.toResponse());
  } catch (error) {
    logger.error(
      `| Public Request | - Error function getAllTopic : ${error.message}`
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

exports.getTopicbyId = async (req, res) => {
  const { id } = req.params;

  try {
    const topic = await knex("kmis_topics")
      .select([
        "kmis_categories_id",
        "topic_cover_ids",
        "title",
        "description",
        "total_quiz",
      ])
      .where("id", id)
      .whereNull("deleted_at")
      .first();
    if (!topic) {
      const response = new WithoutDataResource(
        200,
        "DATA_NOT_FOUND",
        "Data Tidak Ditemukan",
        `Data topik dengan ID '${id}' tidak ditemukan.`
      );
      return res.status(200).json(response.toResponse());
    }

    const data = await topicResource(topic);
    const response = new WithDataResource(
      200,
      "SUCCESS_GET_DATA",
      "Berhasil Mengambil Data",
      `Detail data topik '${topic.title}' berhasil didapatkan.`,
      data
    );
    return res.status(200).json(response.toResponse());
  } catch (error) {
    logger.error(
      `| Public Request | - Error function getTopicbyId: ${error.message}`
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

exports.getTopicbyCategoryId = async (req, res) => {
  const { search } = req.query;
  const { id } = req.params;

  try {
    let query = knex("kmis_topics as topic")
      .select([
        "topic.kmis_categories_id",
        "topic.topic_cover_ids",
        "topic.title",
        "topic.description",
        "topic.total_quiz",
      ])
      .where("topic.kmis_categories_id", id)
      .leftJoin(
        "kmis_categories as category",
        "topic.kmis_categories_id",
        "category.id"
      )
      .whereNull("topic.deleted_at")
      .orderBy("topic.created_at", "desc");

    applySearch(query, search, ["topic.title", "category.title"]);

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
      result.data.map((topic) => topicResource(topic))
    );

    const response = new WithDataResource(
      200,
      "SUCCESS_GET_DATA",
      "Berhasil Mengambil Data",
      "Data topik berdasarkan kategori berhasil diambil.",
      {
        data: serializedData,
        pagination: result.pagination,
      }
    );
    return res.status(200).json(response.toResponse());
  } catch (error) {
    logger.error(
      `| Public Request | - Error function getTopicbyCategoryId: ${error.message}`
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

// User
exports.getAllUser = async (req, res) => {
  const { search } = req.query;

  try {
    let query = knex("users as user")
      .whereNot("user.role_id", 1) // Skip super admin
      .where("user.account_status", 2)
      .leftJoin("roles as role", "user.role_id", "role.id")
      .select([
        "user.name",
        "user.email",
        "user.role_id",
        "user.photo_profile_ids",
      ])
      .whereNull("user.deleted_at")
      .orderBy("user.created_at", "desc");

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

    const serializedData = await Promise.all(
      result.data.map((user) => UserResource(user))
    );

    const response = new WithDataResource(
      200,
      "SUCCESS_GET_DATA",
      "Berhasil Mengambil Data",
      "Data pengguna berhasil diambil.",
      {
        data: serializedData,
        pagination: result.pagination,
      }
    );
    return res.status(200).json(response.toResponse());
  } catch (error) {
    logger.error(
      `| Public Request | - Error function getAllUser : ${error.message}`
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

exports.getAllUserEducator = async (req, res) => {
  const { search } = req.query;

  try {
    let query = knex("users as user")
      .select([
        "user.name",
        "user.email",
        "user.role_id",
        "user.photo_profile_ids",
      ])
      .where("user.account_status", 2)
      .where("user.role_id", 2)
      .leftJoin("roles as role", "user.role_id", "role.id")
      .whereNull("user.deleted_at")
      .orderBy("user.created_at", "desc");

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

    const serializedData = await Promise.all(
      result.data.map((user) => UserResource(user))
    );

    const response = new WithDataResource(
      200,
      "SUCCESS_GET_DATA",
      "Berhasil Mengambil Data",
      "Data pengajar berhasil diambil.",
      {
        data: serializedData,
        pagination: result.pagination,
      }
    );
    return res.status(200).json(response.toResponse());
  } catch (error) {
    logger.error(
      `| Public Request | - Error function getAllUserEducator : ${error.message}`
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

exports.getAllUserStudent = async (req, res) => {
  const { search } = req.query;

  try {
    let query = knex("users as user")
      .where("user.account_status", 2)
      .where("user.role_id", 3)
      .leftJoin("roles as role", "user.role_id", "role.id")
      .select([
        "user.name",
        "user.email",
        "user.role_id",
        "user.photo_profile_ids",
      ])
      .whereNull("user.deleted_at")
      .orderBy("user.created_at", "desc");

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

    const serializedData = await Promise.all(
      result.data.map((user) => UserResource(user))
    );

    const response = new WithDataResource(
      200,
      "SUCCESS_GET_DATA",
      "Berhasil Mengambil Data",
      "Data peserta berhasil diambil.",
      {
        data: serializedData,
        pagination: result.pagination,
      }
    );
    return res.status(200).json(response.toResponse());
  } catch (error) {
    logger.error(
      `| Public Request | - Error function getAllUserStudent : ${error.message}`
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

exports.getAllUserbyRoleId = async (req, res) => {
  const { search } = req.query;
  const { id } = req.params;

  try {
    let query = knex("users as user")
      .whereNot("user.role_id", 1) // Skip super admin
      .where("user.account_status", 2)
      .where("user.role_id", id)
      .leftJoin("roles as role", "user.role_id", "role.id")
      .select([
        "user.name",
        "user.email",
        "user.role_id",
        "user.photo_profile_ids",
      ])
      .whereNull("user.deleted_at")
      .orderBy("user.created_at", "desc");

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

    const serializedData = await Promise.all(
      result.data.map((user) => UserResource(user))
    );

    const response = new WithDataResource(
      200,
      "SUCCESS_GET_DATA",
      "Berhasil Mengambil Data",
      "Data pengguna berhasil diambil.",
      {
        data: serializedData,
        pagination: result.pagination,
      }
    );
    return res.status(200).json(response.toResponse());
  } catch (error) {
    logger.error(
      `| Public Request | - Error function getAllUser : ${error.message}`
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

exports.getUserbyId = async (req, res) => {
  const { id } = req.params;

  try {
    const user = await knex("users")
      .select(["name", "email", "role_id", "photo_profile_ids"])
      .whereNot("role_id", 1) // Skip super admin
      .where("id", id)
      .where("account_status", 2)
      .whereNull("deleted_at")
      .first();
    if (!user) {
      const response = new WithoutDataResource(
        200,
        "DATA_NOT_FOUND",
        "Data Tidak Ditemukan",
        `Data pengguna dengan ID '${id}' tidak ditemukan.`
      );
      return res.status(200).json(response.toResponse());
    }

    const data = await UserResource(user);
    const response = new WithDataResource(
      200,
      "SUCCESS_GET_DATA",
      "Berhasil Mengambil Data",
      `Detail data pengguna berhasil didapatkan.`,
      data
    );
    return res.status(200).json(response.toResponse());
  } catch (error) {
    logger.error(
      `| Public Request | - Error function getUserbyId: ${error.message}`
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

// Material
exports.getAllMaterial = async (req, res) => {
  const { search, categoryId, topicId } = req.query;

  try {
    let query = knex("kmis_materials as material")
      .leftJoin(
        "kmis_categories as category",
        "category.id",
        "material.kmis_categories_id"
      )
      .leftJoin("kmis_topics as topic", "topic.id", "material.kmis_topic_id")
      .select([
        "material.title",
        "material.description",
        "material.material_types",
        "material.created_by",
        "material.uploaded_by",
        "material.kmis_categories_id",
        "material.kmis_topic_id",
      ])
      .whereNull("material.deleted_at")
      .orderBy("material.created_at", "desc");

    applyRelationIn(query, "material.kmis_categories_id", categoryId, {
      as: "number",
    });
    applyRelationIn(query, "material.kmis_topic_id", topicId, {
      as: "number",
    });

    applySearch(query, search, [
      "material.title",
      "category.title",
      "topic.title",
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
      result.data.map((material) => materialResource(material))
    );

    const response = new WithDataResource(
      200,
      "SUCCESS_GET_DATA",
      "Berhasil Mengambil Data",
      "Data materi berhasil diambil.",
      {
        data: serializedData,
        pagination: result.pagination,
      }
    );
    return res.status(200).json(response.toResponse());
  } catch (error) {
    logger.error(
      `| Public Request | - Error function getAllMaterial : ${error.message}`
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

exports.getMaterialbyId = async (req, res) => {
  const { id } = req.params;

  try {
    const material = await knex("kmis_materials")
      .select([
        "title",
        "description",
        "material_types",
        "created_by",
        "uploaded_by",
        "kmis_categories_id",
        "kmis_topic_id",
      ])
      .where("id", id)
      .whereNull("deleted_at")
      .first();
    if (!material) {
      const response = new WithoutDataResource(
        200,
        "DATA_NOT_FOUND",
        "Data Tidak Ditemukan",
        `Data materi dengan ID '${id}' tidak ditemukan.`
      );
      return res.status(200).json(response.toResponse());
    }

    const data = await materialResource(material);
    const response = new WithDataResource(
      200,
      "SUCCESS_GET_DATA",
      "Berhasil Mengambil Data",
      `Detail data materi '${material.title}' berhasil didapatkan.`,
      data
    );
    return res.status(200).json(response.toResponse());
  } catch (error) {
    logger.error(
      `| Public Request | - Error function getMaterialbyId: ${error.message}`
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

exports.getMaterialbyTopicIdorCategoryId = async (req, res) => {
  const { search } = req.query;
  const categoryIds = [
    ...new Set(
      normIdArray(
        req.body?.categoryIds ??
          req.body?.categoryId ??
          req.query?.categoryIds ??
          req.query?.categoryId,
        { as: "number" }
      )
    ),
  ];
  const topicIds = [
    ...new Set(
      normIdArray(
        req.body?.topicIds ??
          req.body?.topicId ??
          req.query?.topicIds ??
          req.query?.topicId,
        { as: "number" }
      )
    ),
  ];

  try {
    if (categoryIds.length === 0 && topicIds.length === 0) {
      const response = new WithoutDataResource(
        400,
        "FAILED_VALIDATION",
        "Format Data Tidak Sesuai Ketentuan",
        "Payload harus diisi minimal salah satu: categoryId[] atau topicId[]."
      );
      return res.status(400).json(response.toResponse());
    }

    if (categoryIds.length > 0) {
      const existCatTxt = await knex("kmis_categories")
        .whereIn("id", categoryIds)
        .pluck("id");

      const missCat = categoryIds
        .map(String)
        .filter((id) => !existCatTxt.includes(id));

      if (missCat.length > 0) {
        const response = new WithoutDataResource(
          400,
          "FAILED_VALIDATION",
          "Validasi Gagal",
          `Beberapa categoryId tidak ditemukan: [${missCat.join(", ")}].`
        );
        return res.status(400).json(response.toResponse());
      }
    }

    if (topicIds.length > 0) {
      const existTopTxt = await knex("kmis_topics")
        .whereIn("id", topicIds)
        .pluck("id");

      const missTop = topicIds
        .map(String)
        .filter((id) => !existTopTxt.includes(id));

      if (missTop.length > 0) {
        const response = new WithoutDataResource(
          400,
          "FAILED_VALIDATION",
          "Validasi Gagal",
          `Beberapa topicId tidak ditemukan: [${missTop.join(", ")}].`
        );
        return res.status(400).json(response.toResponse());
      }
    }

    let query = knex("kmis_materials as material")
      .leftJoin(
        "kmis_categories as category",
        "category.id",
        "material.kmis_categories_id"
      )
      .leftJoin("kmis_topics as topic", "topic.id", "material.kmis_topic_id")
      .select([
        "material.title",
        "material.description",
        "material.material_types",
        "material.created_by",
        "material.uploaded_by",
        "material.kmis_categories_id",
        "material.kmis_topic_id",
      ])
      .whereNull("material.deleted_at")
      .orderBy("material.created_at", "desc");

    if (categoryIds.length > 0)
      query.whereIn("material.kmis_categories_id", categoryIds);
    if (topicIds.length > 0) query.whereIn("material.kmis_topic_id", topicIds);

    applySearch(query, search, [
      "material.title",
      "category.title",
      "topic.title",
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
      result.data.map((material) => materialResource(material))
    );

    const response = new WithDataResource(
      200,
      "SUCCESS_GET_DATA",
      "Berhasil Mengambil Data",
      "Data materi berdasarkan categori atau topik berhasil diambil.",
      {
        data: serializedData,
        pagination: result.pagination,
      }
    );
    return res.status(200).json(response.toResponse());
  } catch (error) {
    logger.error(
      `| Public Request | - Error function getMaterialbyTopicIdorCategoryId: ${error.message}`
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

exports.getMaterialbyCreatedId = async (req, res) => {
  const { search } = req.query;
  const { id } = req.params;

  try {
    let query = knex("kmis_materials as material")
      .leftJoin(
        "kmis_categories as category",
        "category.id",
        "material.kmis_categories_id"
      )
      .leftJoin("kmis_topics as topic", "topic.id", "material.kmis_topic_id")
      .select([
        "material.title",
        "material.description",
        "material.material_types",
        "material.created_by",
        "material.uploaded_by",
        "material.kmis_categories_id",
        "material.kmis_topic_id",
      ])
      .whereNull("material.deleted_at")
      .where("material.created_by", id)
      .orderBy("material.created_at", "desc");

    applySearch(query, search, [
      "material.title",
      "category.title",
      "topic.title",
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
      result.data.map((material) => materialResource(material))
    );

    const response = new WithDataResource(
      200,
      "SUCCESS_GET_DATA",
      "Berhasil Mengambil Data",
      "Data materi berdasarkan atasnama pembuat berhasil diambil.",
      {
        data: serializedData,
        pagination: result.pagination,
      }
    );
    return res.status(200).json(response.toResponse());
  } catch (error) {
    logger.error(
      `| Public Request | - Error function getMaterialbyCreatedId: ${error.message}`
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

exports.getMaterialbyUploadedId = async (req, res) => {
  const { search } = req.query;
  const { id } = req.params;

  try {
    let query = knex("kmis_materials as material")
      .leftJoin(
        "kmis_categories as category",
        "category.id",
        "material.kmis_categories_id"
      )
      .leftJoin("kmis_topics as topic", "topic.id", "material.kmis_topic_id")
      .select([
        "material.title",
        "material.description",
        "material.material_types",
        "material.created_by",
        "material.uploaded_by",
        "material.kmis_categories_id",
        "material.kmis_topic_id",
      ])
      .where("material.uploaded_by", id)
      .whereNull("material.deleted_at")
      .orderBy("material.created_at", "desc");

    applySearch(query, search, [
      "material.title",
      "category.title",
      "topic.title",
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
      result.data.map((material) => materialResource(material))
    );

    const response = new WithDataResource(
      200,
      "SUCCESS_GET_DATA",
      "Berhasil Mengambil Data",
      "Data materi berdasarkan atasnama pengunggah berhasil diambil.",
      {
        data: serializedData,
        pagination: result.pagination,
      }
    );
    return res.status(200).json(response.toResponse());
  } catch (error) {
    logger.error(
      `| Public Request | - Error function getMaterialbyUploadedId: ${error.message}`
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

exports.getMaterialbyMaterialTypes = async (req, res) => {
  const { search } = req.query;
  const { materialType } = req.body;

  try {
    if (!Array.isArray(materialType) || materialType.length === 0) {
      const response = new WithoutDataResource(
        400,
        "FAILED_VALIDATION",
        "Format Data Tidak Sesuai Ketentuan",
        "materialType harus berupa array berisi minimal satu tipe materi."
      );
      return res.status(400).json(response.toResponse());
    }

    const ALLOWED = new Set(["text", "gambar", "video", "dokumen"]);
    const normalize = (v) =>
      String(v ?? "")
        .trim()
        .toLowerCase()
        .replace(/\s+/g, " ");

    // normalisasi (termasuk 'teks' -> 'text') dan hilangkan duplikat
    const normalized = [
      ...new Set(
        materialType
          .map(normalize)
          .map((t) => (t === "teks" ? "text" : t))
          .filter(Boolean)
      ),
    ];

    const invalid = normalized.filter((t) => !ALLOWED.has(t));
    if (invalid.length > 0) {
      const response = new WithoutDataResource(
        400,
        "INVALID_MATERIAL_TYPES",
        "Tipe materi tidak didukung",
        `Tipe yang diizinkan hanya: text, gambar, video, dokumen.`
      );
      return res.status(400).json(response.toResponse());
    }

    let query = knex("kmis_materials as material")
      .leftJoin(
        "kmis_categories as category",
        "category.id",
        "material.kmis_categories_id"
      )
      .leftJoin("kmis_topics as topic", "topic.id", "material.kmis_topic_id")
      .select([
        "material.title",
        "material.description",
        "material.material_types",
        "material.created_by",
        "material.uploaded_by",
        "material.kmis_categories_id",
        "material.kmis_topic_id",
      ])
      .whereIn("material.material_types", normalized)
      .whereNull("material.deleted_at")
      .orderBy("material.created_at", "desc");

    applySearch(query, search, [
      "material.title",
      "category.title",
      "topic.title",
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
      result.data.map((material) => materialResource(material))
    );

    const response = new WithDataResource(
      200,
      "SUCCESS_GET_DATA",
      "Berhasil Mengambil Data",
      "Data materi berdasarkan tipe materi berhasil diambil.",
      {
        data: serializedData,
        pagination: result.pagination,
      }
    );
    return res.status(200).json(response.toResponse());
  } catch (error) {
    logger.error(
      `| Public Request | - Error function getMaterialbyMaterialTypes: ${error.message}`
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

exports.getMaterialbyIsPublic = async (req, res) => {
  const { search } = req.query;
  const { isPublic } = req.body;

  try {
    if (!Array.isArray(isPublic) || isPublic.length === 0) {
      const response = new WithoutDataResource(
        400,
        "INVALID_INPUT",
        "Format Data Tidak Sesuai Ketentuan",
        "isPublic harus berupa array boolean, misalnya: [true] atau [true, false]."
      );
      return res.status(400).json(response.toResponse());
    }
    const allBoolean = isPublic.every((v) => typeof v === "boolean");
    if (!allBoolean) {
      const response = new WithoutDataResource(
        400,
        "INVALID_INPUT_TYPE",
        "Format Data Tidak Sesuai Ketentuan",
        "Setiap nilai pada isPublic harus bertipe boolean (true/false)."
      );
      return res.status(400).json(response.toResponse());
    }

    const normalized = [...new Set(isPublic)];

    let query = knex("kmis_materials as material")
      .leftJoin(
        "kmis_categories as category",
        "category.id",
        "material.kmis_categories_id"
      )
      .leftJoin("kmis_topics as topic", "topic.id", "material.kmis_topic_id")
      .select([
        "material.title",
        "material.description",
        "material.material_types",
        "material.created_by",
        "material.uploaded_by",
        "material.kmis_categories_id",
        "material.kmis_topic_id",
      ])
      .whereIn("material.is_public", normalized)
      .whereNull("material.deleted_at")
      .orderBy("material.created_at", "desc");

    applySearch(query, search, [
      "material.title",
      "category.title",
      "topic.title",
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
      result.data.map((material) => materialResource(material))
    );

    const response = new WithDataResource(
      200,
      "SUCCESS_GET_DATA",
      "Berhasil Mengambil Data",
      "Data materi berdasarkan status publik berhasil diambil.",
      {
        data: serializedData,
        pagination: result.pagination,
      }
    );
    return res.status(200).json(response.toResponse());
  } catch (error) {
    logger.error(
      `| Public Request | - Error function getMaterialbyIsPublic: ${error.message}`
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

// Quiz
exports.getAllQuiz = async (req, res) => {
  const { search, topicId } = req.query;

  try {
    let query = knex("kmis_quiz as quiz")
      .leftJoin("kmis_topics as topic", "topic.id", "quiz.kmis_topic_id")
      .select(
        "quiz.id",
        "quiz.kmis_topic_id",
        "quiz.question",
        "quiz.answer_a",
        "quiz.answer_b",
        "quiz.answer_c",
        "quiz.answer_d",
        "quiz.correct_option",
        "quiz.explanation"
      )
      .whereNull("quiz.deleted_at")
      .orderBy("quiz.created_at", "desc");

    applyRelationIn(query, "quiz.kmis_topic_id", topicId, {
      as: "number",
    });

    applySearch(query, search, ["quiz.question", "topic.title"]);

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
      result.data.map((quiz) => quizResource(quiz))
    );

    const response = new WithDataResource(
      200,
      "SUCCESS_GET_DATA",
      "Berhasil Mengambil Data",
      "Data soal pertanyaan berhasil diambil.",
      {
        data: serializedData,
        pagination: result.pagination,
      }
    );
    return res.status(200).json(response.toResponse());
  } catch (error) {
    logger.error(
      `| Public Request | - Error function getAllQuiz : ${error.message}`
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

exports.getQuizbyId = async (req, res) => {
  const { id } = req.params;

  try {
    const quiz = await knex("kmis_quiz")
      .select(
        "kmis_topic_id",
        "question",
        "answer_a",
        "answer_b",
        "answer_c",
        "answer_d",
        "correct_option",
        "explanation"
      )
      .where("id", id)
      .whereNull("deleted_at")
      .first();
    if (!quiz) {
      const response = new WithoutDataResource(
        200,
        "DATA_NOT_FOUND",
        "Data Tidak Ditemukan",
        `Data soal dengan ID '${id}' tidak ditemukan.`
      );
      return res.status(200).json(response.toResponse());
    }

    const data = await quizResource(quiz);
    const response = new WithDataResource(
      200,
      "SUCCESS_GET_DATA",
      "Berhasil Mengambil Data",
      "Detail data soal berhasil didapatkan.",
      data
    );
    return res.status(200).json(response.toResponse());
  } catch (error) {
    logger.error(
      `| Public Request | - Error function getQuizbyId: ${error.message}`
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

exports.getQuizbytopicId = async (req, res) => {
  const { search } = req.query;
  const topicIds = [
    ...new Set(
      normIdArray(
        req.body?.topicIds ??
          req.body?.topicId ??
          req.query?.topicIds ??
          req.query?.topicId,
        { as: "number" }
      )
    ),
  ];

  try {
    if (topicIds.length === 0) {
      const response = new WithoutDataResource(
        400,
        "FAILED_VALIDATION",
        "Format Data Tidak Sesuai Ketentuan",
        "Payload harus diisi topicId[]."
      );
      return res.status(400).json(response.toResponse());
    }

    const existsTopicIds = await knex("kmis_topics")
      .whereIn("id", topicIds)
      .whereNull("deleted_at")
      .pluck("id");

    const existSet = new Set(existsTopicIds.map(Number));
    const missing = topicIds.filter((id) => !existSet.has(Number(id)));

    if (missing.length > 0) {
      const response = new WithoutDataResource(
        200,
        "DATA_NOT_FOUND",
        "Data Tidak Ditemukan",
        `Beberapa topicId tidak ditemukan: [${missing.join(", ")}].`
      );
      return res.status(200).json(response.toResponse());
    }

    let query = knex("kmis_quiz as quiz")
      .leftJoin("kmis_topics as topic", "topic.id", "quiz.kmis_topic_id")
      .select(
        "quiz.kmis_topic_id",
        "quiz.question",
        "quiz.answer_a",
        "quiz.answer_b",
        "quiz.answer_c",
        "quiz.answer_d",
        "quiz.correct_option",
        "quiz.explanation",
        "quiz.created_at",
        "quiz.updated_at"
      )
      .whereNull("quiz.deleted_at")
      .orderBy("quiz.created_at", "desc");

    if (topicIds.length > 0) query.whereIn("quiz.kmis_topic_id", topicIds);

    applySearch(query, search, ["quiz.question", "topic.title"]);

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
      result.data.map((quiz) => quizResource(quiz))
    );

    const response = new WithDataResource(
      200,
      "SUCCESS_GET_DATA",
      "Berhasil Mengambil Data",
      "Data soal pertanyaan berdasarkan kategori atau topik berhasil diambil.",
      {
        data: serializedData,
        pagination: result.pagination,
      }
    );
    return res.status(200).json(response.toResponse());
  } catch (error) {
    logger.error(
      `| Public Request | - Error function getQuizbytopicId: ${error.message}`
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

// News Category (TextArray)
exports.getAllNewsCategory = async (req, res) => {
  const { search } = req.query;

  try {
    let query = knex("cms_news_categories as category")
      .select(["category.name", "category.description"])
      .whereNull("category.deleted_at")
      .orderBy("category.created_at", "desc");

    applyJsonbSearch(
      query,
      search,
      [
        "category.name->>'id'",
        "category.name->>'en'",
        "category.description->>'id'",
        "category.description->>'en'",
      ],
      {
        mode: "or",
        split: true,
      }
    );

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
      result.data.map((news) => newsCategoryResource(news))
    );

    const response = new WithDataResource(
      200,
      "SUCCESS_GET_DATA",
      "Berhasil Mengambil Data",
      "Data kategori berita berhasil diambil.",
      {
        data: serializedData,
        pagination: result.pagination,
      }
    );
    return res.status(200).json(response.toResponse());
  } catch (error) {
    logger.error(
      `| Public Request | - Error function getAllNewsCategory : ${error.message}`
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

exports.getNewsCategorybyId = async (req, res) => {
  const { id } = req.params;

  try {
    const category = await knex("cms_news_categories")
      .select(["name", "description"])
      .where("id", id)
      .whereNull("deleted_at")
      .first();
    if (!category) {
      const response = new WithoutDataResource(
        200,
        "DATA_NOT_FOUND",
        "Data Tidak Ditemukan",
        `Data kategori berita dengan ID '${id}' tidak ditemukan.`
      );
      return res.status(200).json(response.toResponse());
    }

    const nameObj = isPlainObject(category.name)
      ? category.name
      : parseJsonSafe(category.name) || {};
    const displayName = nameObj.id || nameObj.en || "Tanpa Nama";

    const data = await newsCategoryResource(category);
    const response = new WithDataResource(
      200,
      "SUCCESS_GET_DATA",
      "Berhasil Mengambil Data",
      `Detail data kategori berita '${category.name}' berhasil didapatkan.`,
      data
    );
    return res.status(200).json(response.toResponse());
  } catch (error) {
    logger.error(
      `| Public Request | - Error function getNewsCategorybyId: ${error.message}`
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

// Event Category (TextArray)
exports.getAllEventCategory = async (req, res) => {
  const { search } = req.query;

  try {
    let query = knex("cms_events_categories as category")
      .select(["category.name", "category.description"])
      .whereNull("category.deleted_at")
      .orderBy("category.created_at", "desc");

    applyJsonbSearch(
      query,
      search,
      [
        "category.name->>'id'",
        "category.name->>'en'",
        "category.description->>'id'",
        "category.description->>'en'",
      ],
      {
        mode: "or",
        split: true,
      }
    );

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
      result.data.map((event) => eventCategoryResource(event))
    );

    const response = new WithDataResource(
      200,
      "SUCCESS_GET_DATA",
      "Berhasil Mengambil Data",
      "Data kategori kegiatan berhasil diambil.",
      {
        data: serializedData,
        pagination: result.pagination,
      }
    );
    return res.status(200).json(response.toResponse());
  } catch (error) {
    logger.error(
      `| Public Request | - Error function getAllEventCategory : ${error.message}`
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

exports.getEventCategorybyId = async (req, res) => {
  const { id } = req.params;

  try {
    const category = await knex("cms_events_categories")
      .select(["name", "description"])
      .where("id", id)
      .whereNull("deleted_at")
      .first();
    if (!category) {
      const response = new WithoutDataResource(
        200,
        "DATA_NOT_FOUND",
        "Data Tidak Ditemukan",
        `Data kategori kegiatan dengan ID '${id}' tidak ditemukan.`
      );
      return res.status(200).json(response.toResponse());
    }

    const nameObj = isPlainObject(category.name)
      ? category.name
      : parseJsonSafe(category.name) || {};
    const displayName = nameObj.id || nameObj.en || "Tanpa Nama";

    const data = await newsCategoryResource(category);
    const response = new WithDataResource(
      200,
      "SUCCESS_GET_DATA",
      "Berhasil Mengambil Data",
      `Detail data kategori kegiatan '${category.name}' berhasil didapatkan.`,
      data
    );
    return res.status(200).json(response.toResponse());
  } catch (error) {
    logger.error(
      `| Public Request | - Error function getEventCategorybyId: ${error.message}`
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

// Animal Category (TextArray)
exports.getAllAnimalCategory = async (req, res) => {
  const { search } = req.query;

  try {
    let query = knex("cms_animal_categories as category")
      .select(["category.name", "category.description"])
      .whereNull("category.deleted_at")
      .orderBy("category.created_at", "desc");

    applyJsonbSearch(
      query,
      search,
      [
        "category.name->>'id'",
        "category.name->>'en'",
        "category.description->>'id'",
        "category.description->>'en'",
      ],
      {
        mode: "or",
        split: true,
      }
    );

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
      result.data.map((animal) => animalCategoryResource(animal))
    );

    const response = new WithDataResource(
      200,
      "SUCCESS_GET_DATA",
      "Berhasil Mengambil Data",
      "Data kategori satwa berhasil diambil.",
      {
        data: serializedData,
        pagination: result.pagination,
      }
    );
    return res.status(200).json(response.toResponse());
  } catch (error) {
    logger.error(
      `| Public Request | - Error function getAllAnimalCategory : ${error.message}`
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

exports.getAnimalCategorybyId = async (req, res) => {
  const { id } = req.params;

  try {
    const category = await knex("cms_animal_categories")
      .select(["name", "description"])
      .where("id", id)
      .whereNull("deleted_at")
      .first();
    if (!category) {
      const response = new WithoutDataResource(
        200,
        "DATA_NOT_FOUND",
        "Data Tidak Ditemukan",
        `Data kategori satwa dengan ID '${id}' tidak ditemukan.`
      );
      return res.status(200).json(response.toResponse());
    }

    const nameObj = isPlainObject(category.name)
      ? category.name
      : parseJsonSafe(category.name) || {};
    const displayName = nameObj.id || nameObj.en || "Tanpa Nama";

    const data = await newsCategoryResource(category);
    const response = new WithDataResource(
      200,
      "SUCCESS_GET_DATA",
      "Berhasil Mengambil Data",
      `Detail data kategori satwa '${displayName}' berhasil didapatkan.`,
      data
    );
    return res.status(200).json(response.toResponse());
  } catch (error) {
    logger.error(
      `| Public Request | - Error function getAnimalCategorybyId: ${error.message}`
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

// Event (TextArray)
exports.getAllEvent = async (req, res) => {
  const { search, eventCategory } = req.query;

  try {
    let query = knex("cms_events as event")
      .select([
        "event.cms_event_category_id",
        "event.title",
        "event.description",
        "event.event_content",
        "event.thumbnail_ids",
        "event.created_at",
      ])
      .whereNull("event.deleted_at")
      .orderBy("event.created_at", "desc");

    applyRelationIn(query, "event.cms_event_category_id", eventCategory, {
      as: "number",
    });

    applyJsonbSearch(
      query,
      search,
      ["event.title->>'id'", "event.title->>'en'"],
      {
        mode: "or",
        split: true,
      }
    );

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
      result.data.map((event) => eventResource(event))
    );

    const response = new WithDataResource(
      200,
      "SUCCESS_GET_DATA",
      "Berhasil Mengambil Data",
      "Data kegiatan berhasil diambil.",
      {
        data: serializedData,
        pagination: result.pagination,
      }
    );
    return res.status(200).json(response.toResponse());
  } catch (error) {
    logger.error(
      `| Public Request | - Error function getAllEvent : ${error.message}`
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

exports.getEventbyId = async (req, res) => {
  const { id } = req.params;

  try {
    const event = await knex("cms_events")
      .select([
        "cms_event_category_id",
        "title",
        "description",
        "event_content",
        "thumbnail_ids",
        "created_at",
      ])
      .where("id", id)
      .whereNull("deleted_at")
      .first();
    if (!event) {
      const response = new WithoutDataResource(
        200,
        "DATA_NOT_FOUND",
        "Data Tidak Ditemukan",
        `Data kegiatan dengan ID '${id}' tidak ditemukan.`
      );
      return res.status(200).json(response.toResponse());
    }

    const titleObj = isPlainObject(event.title)
      ? event.title
      : parseJsonSafe(event.title) || {};
    const displayName = titleObj.id || titleObj.en || "Tanpa Nama";

    const data = await eventResource(event);
    const response = new WithDataResource(
      200,
      "SUCCESS_GET_DATA",
      "Berhasil Mengambil Data",
      `Detail data kegiatan '${displayName}' berhasil didapatkan.`,
      data
    );
    return res.status(200).json(response.toResponse());
  } catch (error) {
    logger.error(
      `| Public Request | - Error function getEventbyId: ${error.message}`
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

exports.getEventbyEventCategoryId = async (req, res) => {
  const { search } = req.query;
  const { id } = req.params;

  try {
    let query = knex("cms_events as event")
      .leftJoin(
        "cms_events_categories as category",
        "category.id",
        "event.cms_event_category_id"
      )
      .select([
        "event.cms_event_category_id",
        "event.title",
        "event.description",
        "event.event_content",
        "event.thumbnail_ids",
        "event.created_at",
      ])
      .whereNull("event.deleted_at")
      .where("event.cms_event_category_id", id)
      .orderBy("event.created_at", "desc");

    applySearch(query, search, ["event.title", "category.name"]);

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
      result.data.map((event) => eventResource(event))
    );

    const response = new WithDataResource(
      200,
      "SUCCESS_GET_DATA",
      "Berhasil Mengambil Data",
      "Data kegiatan berdasarkan kategori berhasil diambil.",
      {
        data: serializedData,
        pagination: result.pagination,
      }
    );
    return res.status(200).json(response.toResponse());
  } catch (error) {
    logger.error(
      `| Public Request | - Error function getEventbyEventCategoryId: ${error.message}`
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

// News (TextArray)
exports.getAllNews = async (req, res) => {
  const { search, newsCategory } = req.query;

  try {
    let query = knex("cms_news as news")
      .select([
        "news.cms_news_category_id",
        "news.thumbnail_ids",
        "news.title",
        "news.slug",
        "news.description",
        "news.news_content",
        "news.created_at",
      ])
      .whereNull("news.deleted_at")
      .orderBy("news.created_at", "desc");

    applyRelationIn(query, "news.cms_news_category_id", newsCategory, {
      as: "number",
    });

    applyJsonbSearch(
      query,
      search,
      ["news.title->>'id'", "news.title->>'en'"],
      {
        mode: "or",
        split: true,
      }
    );

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
      result.data.map((news) => newsResource(news))
    );

    const response = new WithDataResource(
      200,
      "SUCCESS_GET_DATA",
      "Berhasil Mengambil Data",
      "Data berita berhasil diambil.",
      {
        data: serializedData,
        pagination: result.pagination,
      }
    );
    return res.status(200).json(response.toResponse());
  } catch (error) {
    logger.error(
      `| Public Request | - Error function getAllNews : ${error.message}`
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

exports.getNewsbyId = async (req, res) => {
  const { id } = req.params;

  try {
    const news = await knex("cms_news")
      .select([
        "thumbnail_ids",
        "cms_news_category_id",
        "title",
        "slug",
        "description",
        "news_content",
        "created_at",
      ])
      .where("id", id)
      .whereNull("deleted_at")
      .first();
    if (!news) {
      const response = new WithoutDataResource(
        200,
        "DATA_NOT_FOUND",
        "Data Tidak Ditemukan",
        `Data berita dengan ID '${id}' tidak ditemukan.`
      );
      return res.status(200).json(response.toResponse());
    }

    const titleObj = isPlainObject(news.title)
      ? news.title
      : parseJsonSafe(news.title) || {};
    const displayName = titleObj.id || titleObj.en || "Tanpa Nama";

    const data = await newsResource(news);
    const response = new WithDataResource(
      200,
      "SUCCESS_GET_DATA",
      "Berhasil Mengambil Data",
      `Detail data berita '${displayName}' berhasil didapatkan.`,
      data
    );
    return res.status(200).json(response.toResponse());
  } catch (error) {
    logger.error(
      `| Public Request | - Error function getNewsbyId: ${error.message}`
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

exports.getNewsbyNewsCategoryId = async (req, res) => {
  const { search } = req.query;
  const { id } = req.params;

  try {
    let query = knex("cms_news as news")
      .leftJoin(
        "cms_news_categories as category",
        "category.id",
        "news.cms_news_category_id"
      )
      .select([
        "news.cms_news_category_id",
        "news.title",
        "news.slug",
        "news.description",
        "news.news_content",
        "news.thumbnail_ids",
        "news.created_at",
      ])
      .whereNull("news.deleted_at")
      .where("news.cms_news_category_id", id)
      .orderBy("news.created_at", "desc");

    applySearch(query, search, ["news.title", "category.name"]);

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
      result.data.map((news) => newsResource(news))
    );

    const response = new WithDataResource(
      200,
      "SUCCESS_GET_DATA",
      "Berhasil Mengambil Data",
      "Data berita berdasarkan kategori berhasil diambil.",
      {
        data: serializedData,
        pagination: result.pagination,
      }
    );
    return res.status(200).json(response.toResponse());
  } catch (error) {
    logger.error(
      `| Public Request | - Error function getNewsbyNewsCategoryId: ${error.message}`
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

exports.getNewsbySlug = async (req, res) => {
  const { slug } = req.params;

  try {
    const news = await knex("cms_news")
      .select([
        "thumbnail_ids",
        "cms_news_category_id",
        "title",
        "slug",
        "description",
        "news_content",
        "created_at",
      ])
      .whereNull("deleted_at")
      .andWhere(function () {
        this.whereRaw("lower(slug->>'id') = lower(?)", [slug]).orWhereRaw(
          "lower(slug->>'en') = lower(?)",
          [slug]
        );
      })
      .first();
    if (!news) {
      const response = new WithoutDataResource(
        200,
        "DATA_NOT_FOUND",
        "Data Tidak Ditemukan",
        `Data berita dengan ID '${id}' tidak ditemukan.`
      );
      return res.status(200).json(response.toResponse());
    }

    const data = await newsResource(news);

    const displayTitle =
      (news.title && (news.title.id || news.title.en)) || "Tanpa Judul";
    const response = new WithDataResource(
      200,
      "SUCCESS_GET_DATA",
      "Berhasil Mengambil Data",
      `Detail data berita '${displayTitle}' berdasarkan 'slug' berhasil didapatkan.`,
      data
    );
    return res.status(200).json(response.toResponse());
  } catch (error) {
    logger.error(
      `| Public Request | - Error function getNewsbySlug: ${error.message}`
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

// Animal Composition (TextArray)
exports.getAllAnimalComposition = async (req, res) => {
  const { search, animalCategory } = req.query;

  try {
    let query = knex("cms_animal_composition as animal")
      .select([
        "animal.cms_animal_category_id",
        "animal.species_image_ids",
        "animal.name",
        "animal.description",
        "animal.total",
      ])
      .whereNull("animal.deleted_at")
      .orderBy("animal.created_at", "desc");

    applyRelationIn(query, "animal.cms_animal_category_id", animalCategory, {
      as: "number",
    });

    applyJsonbSearch(
      query,
      search,
      ["animal.name->>'id'", "animal.name->>'en'"],
      {
        mode: "or",
        split: true,
      }
    );

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
      result.data.map((animal) => animalCompositionResource(animal))
    );

    const response = new WithDataResource(
      200,
      "SUCCESS_GET_DATA",
      "Berhasil Mengambil Data",
      "Data komposisi satwa berhasil diambil.",
      {
        data: serializedData,
        pagination: result.pagination,
      }
    );
    return res.status(200).json(response.toResponse());
  } catch (error) {
    logger.error(
      `| Public Request | - Error function getAllAnimalComposition : ${error.message}`
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

exports.getAnimalCompositionbyId = async (req, res) => {
  const { id } = req.params;

  try {
    const animal = await knex("cms_animal_composition")
      .select([
        "cms_animal_category_id",
        "species_image_ids",
        "name",
        "description",
        "total",
      ])
      .where("id", id)
      .whereNull("deleted_at")
      .first();
    if (!animal) {
      const response = new WithoutDataResource(
        200,
        "DATA_NOT_FOUND",
        "Data Tidak Ditemukan",
        `Data komposisi satwa dengan ID '${id}' tidak ditemukan.`
      );
      return res.status(200).json(response.toResponse());
    }

    const nameObj = isPlainObject(animal.name)
      ? animal.name
      : parseJsonSafe(animal.name) || {};
    const displayName = nameObj.id || nameObj.en || "Tanpa Nama";

    const data = await animalCompositionResource(animal);
    const response = new WithDataResource(
      200,
      "SUCCESS_GET_DATA",
      "Berhasil Mengambil Data",
      `Detail data komposisi satwa '${displayName}' berhasil didapatkan.`,
      data
    );
    return res.status(200).json(response.toResponse());
  } catch (error) {
    logger.error(
      `| Public Request | - Error function getAnimalCompositionbyId: ${error.message}`
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

exports.getAnimalCompositionbyAnimalCategoryId = async (req, res) => {
  const { search } = req.query;
  const { id } = req.params;

  try {
    let query = knex("cms_animal_composition as animal")
      .leftJoin(
        "cms_animal_categories as category",
        "category.id",
        "animal.cms_animal_category_id"
      )
      .select([
        "animal.cms_animal_category_id",
        "animal.name",
        "animal.description",
        "animal.total",
        "animal.species_image_ids",
      ])
      .whereNull("animal.deleted_at")
      .where("animal.cms_animal_category_id", id)
      .orderBy("animal.created_at", "desc");

    applySearch(query, search, ["animal.name", "category.name"]);

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
      result.data.map((event) => animalCompositionResource(event))
    );

    const response = new WithDataResource(
      200,
      "SUCCESS_GET_DATA",
      "Berhasil Mengambil Data",
      "Data komposisi satwa berdasarkan kategori berhasil diambil.",
      {
        data: serializedData,
        pagination: result.pagination,
      }
    );
    return res.status(200).json(response.toResponse());
  } catch (error) {
    logger.error(
      `| Public Request | - Error function getAnimalCompositionbyAnimalCategoryId: ${error.message}`
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

// Legal Document (TextArray)
exports.getAllLegalDocument = async (req, res) => {
  const { search, start_date, end_date } = req.query;

  try {
    const dr = validateDateRangeRequiredBoth(start_date, end_date);
    if (!dr.ok) {
      const response = new WithoutDataResource(400, dr.code, dr.title, dr.desc);
      return res.status(400).json(response.toResponse());
    }

    let query = knex("cms_legal_documents as document")
      .select([
        "document.id",
        "document.document_ids",
        "document.title",
        "document.description",
        "document.created_at",
      ])
      .whereNull("document.deleted_at")
      .orderBy("document.created_at", "desc");

    applyStartEndDateFilter(
      query,
      "document.created_at",
      start_date,
      end_date,
      {
        inclusiveEnd: true,
      }
    );

    applyJsonbSearch(
      query,
      search,
      ["document.title->>'id'", "document.title->>'en'"],
      {
        mode: "or",
        split: true,
      }
    );

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
      result.data.map((document) => legalDocumentResource(document))
    );

    const response = new WithDataResource(
      200,
      "SUCCESS_GET_DATA",
      "Berhasil Mengambil Data",
      "Data dokumen hukum berhasil diambil.",
      {
        data: serializedData,
        pagination: result.pagination,
      }
    );
    return res.status(200).json(response.toResponse());
  } catch (error) {
    logger.error(
      `| Public Request | - Error function getAllLegalDocument : ${error.message}`
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

exports.getLegalDocumentbyId = async (req, res) => {
  const { id } = req.params;

  try {
    const document = await knex("cms_legal_documents")
      .select(["id", "document_ids", "title", "description", "created_at"])
      .where("id", id)
      .whereNull("deleted_at")
      .first();
    if (!document) {
      const response = new WithoutDataResource(
        200,
        "DATA_NOT_FOUND",
        "Data Tidak Ditemukan",
        `Data dokumen hukum dengan ID '${id}' tidak ditemukan.`
      );
      return res.status(200).json(response.toResponse());
    }

    const titleObj = isPlainObject(document.title)
      ? document.title
      : parseJsonSafe(document.title) || {};
    const displayName = titleObj.id || titleObj.en || "Tanpa Nama";

    const data = await legalDocumentResource(document);
    const response = new WithDataResource(
      200,
      "SUCCESS_GET_DATA",
      "Berhasil Mengambil Data",
      `Detail data dokumen hukum '${displayName}' berhasil didapatkan.`,
      data
    );
    return res.status(200).json(response.toResponse());
  } catch (error) {
    logger.error(
      `| Public Request | - Error function getLegalDocumentbyId: ${error.message}`
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

// Content
exports.getAllContent = async (req, res) => {
  try {
    // Content
    const contentRows = await knex("cms_contents as content")
      .select([
        "content.type",
        "content.content",
        "content.content_file_ids",
        knex.raw(`"content"."order" as ord`), // quote kolom "order"
      ])
      .whereNull("content.deleted_at")
      .orderBy(knex.raw(`"content"."order"`), "asc");

    const staticContents = {};
    for (const row of contentRows) {
      const key = `${row.ord}`;
      staticContents[key] = await contentResource(row);
    }

    // Event
    const eventRows = await knex("cms_events as event")
      .select([
        "event.cms_event_category_id",
        "event.title",
        "event.description",
        "event.event_content",
        "event.thumbnail_ids",
        "event.created_at",
      ])
      .whereNull("event.deleted_at")
      .orderBy("event.created_at", "desc")
      .limit(3);

    const homeActivities = await Promise.all(eventRows.map(eventResource));

    // News
    const newsRows = await knex("cms_news as news")
      .select([
        "news.cms_news_category_id",
        "news.thumbnail_ids",
        "news.title",
        "news.slug",
        "news.description",
        "news.news_content",
        "news.created_at",
      ])
      .whereNull("news.deleted_at")
      .orderBy("news.created_at", "desc")
      .limit(3);

    const homeNews = await Promise.all(newsRows.map(newsResource));

    // --- Animal widgets (baru) ---
    const homeAnimalComposition = await buildHomeAnimalCompositionLocal(knex);
    const homeCompletionProgress = await buildHomeCompletionProgressLocal(
      knex,
      { yearsBack: 2 }
    );

    // Legal Docs
    const legalDocumentRows = await knex("cms_legal_documents")
      .select(["title", "description", "document_ids", "created_at"])
      .whereNull("deleted_at")
      .orderBy("created_at", "desc")
      .limit(4);

    const homeLegalDocuments = await Promise.all(
      legalDocumentRows.map(legalDocumentResource)
    );

    if (
      Object.keys(staticContents).length === 0 &&
      homeActivities.length === 0 &&
      homeNews.length === 0 &&
      homeAnimalComposition.length === 0 &&
      homeCompletionProgress.every((m) =>
        Object.values(m).every((v) => v === 0 || v === null)
      ) &&
      homeLegalDocuments.length === 0
    ) {
      const response = new WithoutDataResource(
        200,
        "DATA_NOT_FOUND",
        "Data Tidak Ditemukan",
        "Belum ada konten, event, berita, komposisi satwa, atau dokumen hukum yang tersedia."
      );
      return res.status(200).json(response.toResponse());
    }

    const response = new WithDataResource(
      200,
      "SUCCESS_GET_DATA",
      "Berhasil Mengambil Data",
      "Data konten CMS berhasil diambil.",
      {
        staticContents,
        homeActivities,
        homeAnimalComposition,
        homeCompletionProgress,
        homeLegalDocuments,
        homeNews,
      }
    );
    return res.status(200).json(response.toResponse());
  } catch (error) {
    logger.error(
      `| Public Request | - Error function getAllContent : ${error.message}`
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

exports.getContentbyOrder = async (req, res) => {
  const ord = Number(req.params.id);
  if (!Number.isInteger(ord) || ord < 0) {
    const response = new WithoutDataResource(
      400,
      "FAILED_VALIDATION",
      "Format Data Tidak Sesuai Ketentuan",
      "Parameter order harus bilangan bulat >= 0."
    );
    return res.status(400).json(response.toResponse());
  }

  try {
    const row = await knex("cms_contents as content")
      .select([
        "content.type",
        "content.content",
        "content.content_file_ids",
        knex.raw(`"content"."order" as ord`),
      ])
      .whereRaw(`"content"."order" = ?`, [ord]) // quote kolom "order"
      .whereNull("content.deleted_at")
      .orderBy("content.created_at", "desc")
      .first();

    if (!row) {
      const response = new WithoutDataResource(
        200,
        "DATA_NOT_FOUND",
        "Data Tidak Ditemukan",
        `Konten dengan order '${ord}' tidak ditemukan.`
      );
      return res.status(200).json(response.toResponse());
    }

    const serialized = await contentResource(row);

    const payload = { [String(row.ord)]: serialized };

    const response = new WithDataResource(
      200,
      "SUCCESS_GET_DATA",
      "Berhasil Mengambil Data",
      "Data konten berdasarkan order berhasil diambil.",
      payload
    );
    return res.status(200).json(response.toResponse());
  } catch (error) {
    logger.error(
      `| Public Request | - Error function getContentbyOrder : ${error.message}`
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

exports.getContentHero = async (req, res) => {
  let orderIds = [
    ...new Set(
      normIdArray(req.body?.orderIds ?? req.query?.orderIds, { as: "number" })
    ),
  ].filter((n) => Number.isInteger(n) && n >= 0);

  if (orderIds.length === 0) orderIds = [1, 2, 3, 4, 5];

  try {
    const rows = await knex("cms_contents as content")
      .select([
        "content.type",
        "content.content",
        "content.content_file_ids",
        knex.raw(`"content"."order" as ord`), // quote kolom "order"
      ])
      .whereIn(knex.raw(`"content"."order"`), orderIds)
      .whereNull("content.deleted_at")
      .orderBy(knex.raw(`"content"."order"`), "asc");

    const payload = {};
    for (const row of rows) {
      const key = String(row.ord);
      if (!payload[key]) {
        payload[key] = await contentResource(row);
      }
    }

    if (Object.keys(payload).length === 0) {
      const response = new WithoutDataResource(
        200,
        "DATA_NOT_FOUND",
        "Data Tidak Ditemukan",
        "Belum ada konten hero yang tersedia."
      );
      return res.status(200).json(response.toResponse());
    }

    const response = new WithDataResource(
      200,
      "SUCCESS_GET_DATA",
      "Berhasil Mengambil Data",
      "Data konten hero berhasil diambil.",
      payload
    );
    return res.status(200).json(response.toResponse());
  } catch (error) {
    logger.error(
      `| Public Request | - Error function getAllContentHero : ${error.message}`
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

async function buildHomeAnimalCompositionLocal(knex) {
  const rows = await knex("cms_animal_composition as cac")
    .leftJoin(
      "cms_animal_categories as cat",
      "cat.id",
      "cac.cms_animal_category_id"
    )
    .whereNull("cac.deleted_at")
    .whereNull("cat.deleted_at")
    .groupBy("cat.id", "cat.name")
    .select([
      "cat.name", // JSONB
      knex.raw("SUM(cac.total)::bigint AS total"), // SUM -> string
    ])
    .orderBy("cat.id", "asc");

  const totalAll = rows.reduce((s, r) => s + Number(r.total || 0), 0);

  const out = rows.map((r) => {
    let nmObj = {};
    if (isPlainObject(r.name)) {
      nmObj = r.name;
    } else if (typeof r.name === "string") {
      nmObj = parseJsonSafe(r.name) || {};
    }
    const nmId =
      nmObj && typeof nmObj.id === "string" && nmObj.id.trim() !== ""
        ? nmObj.id
        : typeof r.name === "string"
        ? r.name
        : "Unknown";

    const value = Number(r.total || 0);
    const percentage = totalAll > 0 ? Math.round((value / totalAll) * 100) : 0;

    return { name: nmId, value, percentage };
  });

  // urutkan dari value terbesar
  out.sort((a, b) => b.value - a.value);

  return out;
}

async function buildHomeCompletionProgressLocal(knex, { yearsBack = 2 } = {}) {
  const now = new Date();
  const curYear = now.getFullYear();
  const curMonth = now.getMonth() + 1; // 1..12

  const years = Array.from(
    { length: yearsBack + 1 },
    (_, i) => curYear - yearsBack + i
  );

  const monthly = await knex("cms_animal_composition as cac")
    .select([
      knex.raw("EXTRACT(YEAR  FROM cac.created_at)::int AS yr"),
      knex.raw("EXTRACT(MONTH FROM cac.created_at)::int AS mo"),
      knex.raw("SUM(cac.total)::bigint AS total"),
    ])
    .whereNull("cac.deleted_at")
    .whereIn(knex.raw("EXTRACT(YEAR FROM cac.created_at)::int"), years)
    .groupByRaw("1,2")
    .orderBy([
      { column: knex.raw("yr"), order: "asc" },
      { column: knex.raw("mo"), order: "asc" },
    ]);

  // tabel total bulanan
  const totals = {};
  for (const y of years) totals[y] = Array.from({ length: 12 }, () => 0);

  for (const r of monthly) {
    const y = r.yr,
      m = r.mo;
    totals[y][m - 1] = Number(r.total || 0);
  }

  // akumulasi per bulan
  const cumulative = {};
  for (const y of years) {
    cumulative[y] = [];
    let run = 0;
    for (let m = 1; m <= 12; m++) {
      run += totals[y][m - 1];
      cumulative[y][m - 1] = run;
    }
  }

  // bentuk array 12 objek (Jan..Des)
  const result = Array.from({ length: 12 }, (_, i) => {
    const obj = {};
    for (const y of years) {
      if (y === curYear && i + 1 > curMonth) {
        obj[String(y)] = null; // bulan mendatang → null
      } else {
        obj[String(y)] = cumulative[y][i];
      }
    }
    return obj;
  });

  return result;
}
