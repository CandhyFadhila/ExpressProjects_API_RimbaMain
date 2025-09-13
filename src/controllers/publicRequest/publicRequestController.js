const knex = require("../../config/database");
const logger = require("../../utils/logger");
const {
  applySearch,
  applyPagination,
  formatPaginationResult,
} = require("../../helpers/queryHelper");
const WithDataResource = require("../../resources/WithDataResource");
const WithoutDataResource = require("../../resources/WithoutDataResource");
const categoryResource = require("../../resources/kmis/categoryResource");
const topicResource = require("../../resources/kmis/topicResource");
const UserResource = require("../../resources/auth/UserResource");
const RoleResource = require("../../resources/auth/RoleResource");
const materialResource = require("../../resources/kmis/materialResource");

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
      .whereNot("user.id", 1) // Skip super admin
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
      .whereNot("user.id", 1) // Skip super admin
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
      .whereNot("id", 1) // Skip super admin
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

exports.getMaterialbyCategoryId = async (req, res) => {
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
      .where("material.kmis_categories_id", id)
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
      "Data materi berdasarkan kategori berhasil diambil.",
      {
        data: serializedData,
        pagination: result.pagination,
      }
    );
    return res.status(200).json(response.toResponse());
  } catch (error) {
    logger.error(
      `| Public Request | - Error function getMaterialbyCategoryId: ${error.message}`
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

exports.getMaterialbyTopicId = async (req, res) => {
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
      .where("material.kmis_topics_id", id)
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
      "Data materi berdasarkan topik berhasil diambil.",
      {
        data: serializedData,
        pagination: result.pagination,
      }
    );
    return res.status(200).json(response.toResponse());
  } catch (error) {
    logger.error(
      `| Public Request | - Error function getMaterialbyTopicId: ${error.message}`
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
