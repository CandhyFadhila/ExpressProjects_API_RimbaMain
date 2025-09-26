const knex = require("../../config/database");
const logger = require("../../utils/logger");
const {
  applySearch,
  applyJsonbSearch,
  applyPagination,
  formatPaginationResult,
} = require("../../helpers/queryHelper");
const { normIdArray } = require("../../helpers/inputNorm");
const WithDataResource = require("../../resources/WithDataResource");
const WithoutDataResource = require("../../resources/WithoutDataResource");
const UserResource = require("../../resources/auth/UserResource");
const RoleResource = require("../../resources/auth/RoleResource");
const categoryResource = require("../../resources/kmis/categoryResource");
const topicResource = require("../../resources/kmis/topicResource");
const materialResource = require("../../resources/kmis/materialResource");
const quizCategoryResource = require("../../resources/kmis/quizCategoryResource");
const quizResource = require("../../resources/kmis/quizResource");
const newsCategoryResource = require("../../resources/masterData/newsCategoryResource");
const newsResource = require("../../resources/cms/newsResource");
const eventCategoryResource = require("../../resources/masterData/eventCategoryResource");
const eventResource = require("../../resources/cms/eventResource");
const contentResource = require("../../resources/cms/contentResource");

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
  const { search } = req.query;

  try {
    let query = knex("kmis_topics as topic")
      .select([
        "topic.kmis_categories_id",
        "topic.topic_cover_ids",
        "topic.title",
        "topic.description",
      ])
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
      .select(["kmis_categories_id", "topic_cover_ids", "title", "description"])
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
  const { search } = req.query;

  try {
    let query = knex("kmis_materials as material")
      .leftJoin(
        "kmis_categories as category",
        "category.id",
        "material.kmis_categories_id"
      )
      .leftJoin("kmis_topics as topic", "topic.id", "material.kmis_topics_id")
      .select([
        "material.title",
        "material.description",
        "material.material_types",
        "material.created_by",
        "material.uploaded_by",
        "material.kmis_categories_id",
        "material.kmis_topics_id",
      ])
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
        "kmis_topics_id",
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
      .leftJoin("kmis_topics as topic", "topic.id", "material.kmis_topics_id")
      .select([
        "material.title",
        "material.description",
        "material.material_types",
        "material.created_by",
        "material.uploaded_by",
        "material.kmis_categories_id",
        "material.kmis_topics_id",
      ])
      .whereNull("material.deleted_at")
      .orderBy("material.created_at", "desc");

    if (categoryIds.length > 0)
      query.whereIn("material.kmis_categories_id", categoryIds);
    if (topicIds.length > 0) query.whereIn("material.kmis_topics_id", topicIds);

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
      .leftJoin("kmis_topics as topic", "topic.id", "material.kmis_topics_id")
      .select([
        "material.title",
        "material.description",
        "material.material_types",
        "material.created_by",
        "material.uploaded_by",
        "material.kmis_categories_id",
        "material.kmis_topics_id",
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
      .leftJoin("kmis_topics as topic", "topic.id", "material.kmis_topics_id")
      .select([
        "material.title",
        "material.description",
        "material.material_types",
        "material.created_by",
        "material.uploaded_by",
        "material.kmis_categories_id",
        "material.kmis_topics_id",
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
      .leftJoin("kmis_topics as topic", "topic.id", "material.kmis_topics_id")
      .select([
        "material.title",
        "material.description",
        "material.material_types",
        "material.created_by",
        "material.uploaded_by",
        "material.kmis_categories_id",
        "material.kmis_topics_id",
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
      .leftJoin("kmis_topics as topic", "topic.id", "material.kmis_topics_id")
      .select([
        "material.title",
        "material.description",
        "material.material_types",
        "material.created_by",
        "material.uploaded_by",
        "material.kmis_categories_id",
        "material.kmis_topics_id",
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

// Quiz Category
exports.getAllQuizCategory = async (req, res) => {
  const { search } = req.query;

  try {
    let query = knex("kmis_quiz_categories as quiz_categories")
      .leftJoin(
        "kmis_categories as category",
        "category.id",
        "quiz_categories.kmis_categories_id"
      )
      .leftJoin(
        "kmis_topics as topic",
        "topic.id",
        "quiz_categories.kmis_topics_id"
      )
      .select(
        "quiz_categories.kmis_categories_id",
        "quiz_categories.kmis_topics_id",
        "quiz_categories.name",
        "quiz_categories.description",
        "quiz_categories.total_question"
      )
      .whereNull("quiz_categories.deleted_at")
      .orderBy("quiz_categories.created_at", "desc");

    applySearch(query, search, [
      "quiz_categories.name",
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
      result.data.map((quizCategory) => quizCategoryResource(quizCategory))
    );

    const response = new WithDataResource(
      200,
      "SUCCESS_GET_DATA",
      "Berhasil Mengambil Data",
      "Data kategori soal pertanyaan berhasil diambil.",
      {
        data: serializedData,
        pagination: result.pagination,
      }
    );
    return res.status(200).json(response.toResponse());
  } catch (error) {
    logger.error(
      `| Public Request | - Error function getAllQuizCategory : ${error.message}`
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

exports.getQuizCategorybyId = async (req, res) => {
  const { id } = req.params;

  try {
    const quiz = await knex("kmis_quiz_categories")
      .select(
        "kmis_categories_id",
        "kmis_topics_id",
        "name",
        "description",
        "total_question"
      )
      .where("id", id)
      .whereNull("deleted_at")
      .first();
    if (!quiz) {
      const response = new WithoutDataResource(
        200,
        "DATA_NOT_FOUND",
        "Data Tidak Ditemukan",
        `Data kategori soal dengan ID '${id}' tidak ditemukan.`
      );
      return res.status(200).json(response.toResponse());
    }

    const data = await quizCategoryResource(quiz);
    const response = new WithDataResource(
      200,
      "SUCCESS_GET_DATA",
      "Berhasil Mengambil Data",
      "Detail data kategori soal berhasil didapatkan.",
      data
    );
    return res.status(200).json(response.toResponse());
  } catch (error) {
    logger.error(
      `| Public Request | - Error function getQuizCategorybyId: ${error.message}`
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

exports.getQuizCategorybyTopicIdorCategoryId = async (req, res) => {
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

    let query = knex("kmis_quiz_categories as quiz")
      .leftJoin(
        "kmis_categories as category",
        "category.id",
        "quiz.kmis_categories_id"
      )
      .leftJoin("kmis_topics as topic", "topic.id", "quiz.kmis_topics_id")
      .select(
        "quiz.kmis_categories_id",
        "quiz.kmis_topics_id",
        "quiz.name",
        "quiz.description",
        "quiz.total_question"
      )
      .whereNull("quiz.deleted_at")
      .orderBy("quiz.created_at", "desc");

    if (categoryIds.length > 0)
      query.whereIn("quiz.kmis_categories_id", categoryIds);
    if (topicIds.length > 0) query.whereIn("quiz.kmis_topics_id", topicIds);

    applySearch(query, search, [
      "quiz.question",
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
      result.data.map((quizCategory) => quizCategoryResource(quizCategory))
    );

    const response = new WithDataResource(
      200,
      "SUCCESS_GET_DATA",
      "Berhasil Mengambil Data",
      "Data kategori soal pertanyaan berdasarkan kategori atau topik berhasil diambil.",
      {
        data: serializedData,
        pagination: result.pagination,
      }
    );
    return res.status(200).json(response.toResponse());
  } catch (error) {
    logger.error(
      `| Public Request | - Error function getQuizbyTopicIdorCategoryId: ${error.message}`
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
  const { search } = req.query;

  try {
    let query = knex("kmis_quiz as quiz")
      .leftJoin(
        "kmis_categories as category",
        "category.id",
        "quiz.kmis_categories_id"
      )
      .leftJoin("kmis_topics as topic", "topic.id", "quiz.kmis_topics_id")
      .select(
        "quiz.id",
        "quiz.kmis_categories_id",
        "quiz.kmis_topics_id",
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

    applySearch(query, search, [
      "quiz.question",
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
        "kmis_categories_id",
        "kmis_topics_id",
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

exports.getQuizbyquizCategoryId = async (req, res) => {
  const { search } = req.query;
  const quizCategoryIds = [
    ...new Set(
      normIdArray(
        req.body?.quizCategoryIds ??
          req.body?.quizCategoryId ??
          req.query?.quizCategoryIds ??
          req.query?.quizCategoryId,
        { as: "number" }
      )
    ),
  ];

  try {
    if (quizCategoryIds.length === 0) {
      const response = new WithoutDataResource(
        400,
        "FAILED_VALIDATION",
        "Format Data Tidak Sesuai Ketentuan",
        "Payload harus diisi quizCategoryId[]."
      );
      return res.status(400).json(response.toResponse());
    }

    if (quizCategoryIds.length > 0) {
      const existCatTxt = await knex("kmis_quiz_categories")
        .whereIn("id", quizCategoryIds)
        .pluck("id");

      const missCat = quizCategoryIds
        .map(String)
        .filter((id) => !existCatTxt.includes(id));

      if (missCat.length > 0) {
        const response = new WithoutDataResource(
          400,
          "FAILED_VALIDATION",
          "Validasi Gagal",
          `Beberapa quizCategoryId tidak ditemukan: [${missCat.join(", ")}].`
        );
        return res.status(400).json(response.toResponse());
      }
    }

    let query = knex("kmis_quiz as quiz")
      .leftJoin(
        "kmis_quiz_categories as category",
        "category.id",
        "quiz.kmis_quiz_categories_id"
      )
      .select(
        "quiz.kmis_quiz_categories_id",
        "quiz.question",
        "quiz.answer_a",
        "quiz.answer_b",
        "quiz.answer_c",
        "quiz.answer_d",
        "quiz.correct_option",
        "quiz.explanation",
        "quiz.deleted_at",
        "quiz.created_at",
        "quiz.updated_at"
      )
      .whereNull("quiz.deleted_at")
      .orderBy("quiz.created_at", "desc");

    if (quizCategoryIds.length > 0)
      query.whereIn("quiz.kmis_quiz_categories_id", quizCategoryIds);

    applySearch(query, search, [
      "quiz.question",
      "category.name"
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
      `| Public Request | - Error function getQuizbyTopicIdorCategoryId: ${error.message}`
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

// News Category
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

// Event Category
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

// Event
exports.getAllEvent = async (req, res) => {
  const { search } = req.query;

  try {
    let query = knex("cms_events as event")
      .select([
        "event.cms_event_category_id",
        "event.title",
        "event.description",
        "event.event_content",
        "event.thumbnail_ids",
      ])
      .whereNull("event.deleted_at")
      .orderBy("event.created_at", "desc");

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

    const data = await eventResource(event);
    const response = new WithDataResource(
      200,
      "SUCCESS_GET_DATA",
      "Berhasil Mengambil Data",
      `Detail data kegiatan '${event.title}' berhasil didapatkan.`,
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

// News
exports.getAllNews = async (req, res) => {
  const { search } = req.query;

  try {
    let query = knex("cms_news as news")
      .select([
        "news.cms_news_category_id",
        "news.thumbnail_ids",
        "news.title",
        "news.slug",
        "news.description",
        "news.news_content",
      ])
      .whereNull("news.deleted_at")
      .orderBy("news.created_at", "desc");

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

    const data = await newsResource(news);
    const response = new WithDataResource(
      200,
      "SUCCESS_GET_DATA",
      "Berhasil Mengambil Data",
      `Detail data berita '${news.title}' berhasil didapatkan.`,
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

    const contents = {};
    for (const row of contentRows) {
      const key = `${row.ord}`;
      contents[key] = await contentResource(row);
    }

    // Event
    const eventRows = await knex("cms_events as event")
      .select([
        "event.cms_event_category_id",
        "event.title",
        "event.description",
        "event.event_content",
        "event.thumbnail_ids",
      ])
      .whereNull("event.deleted_at")
      .orderBy("event.created_at", "desc")
      .limit(3);

    const events = await Promise.all(eventRows.map(eventResource));

    // News
    const newsRows = await knex("cms_news as news")
      .select([
        "news.cms_news_category_id",
        "news.thumbnail_ids",
        "news.title",
        "news.slug",
        "news.description",
        "news.news_content",
      ])
      .whereNull("news.deleted_at")
      .orderBy("news.created_at", "desc");

    const news = await Promise.all(newsRows.map(newsResource));

    if (
      Object.keys(contents).length === 0 &&
      events.length === 0 &&
      news.length === 0
    ) {
      const response = new WithoutDataResource(
        200,
        "DATA_NOT_FOUND",
        "Data Tidak Ditemukan",
        "Belum ada konten, event, atau berita yang tersedia."
      );
      return res.status(200).json(response.toResponse());
    }

    const response = new WithDataResource(
      200,
      "SUCCESS_GET_DATA",
      "Berhasil Mengambil Data",
      "Data konten CMS berhasil diambil.",
      {
        contents,
        events,
        news,
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
        404,
        "DATA_NOT_FOUND",
        "Data Tidak Ditemukan",
        `Konten dengan order '${ord}' tidak ditemukan.`
      );
      return res.status(404).json(response.toResponse());
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
