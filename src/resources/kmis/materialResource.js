const {
  resolveArrayRelations,
} = require("../../helpers/resolveArrayRelations");
const knex = require("../../config/database");
const categoryResource = require("../../resources/kmis/categoryResource");
const topicResource = require("../../resources/kmis/topicResource");
const UserResource = require("../../resources/auth/UserResource");
const documentResource = require("../../resources/doc/documentResource");

async function materialResource(material) {
  const category = material.kmis_categories_id
    ? await knex("kmis_categories")
        .where("id", material.kmis_categories_id)
        .first()
    : null;

  const createdUser = material.created_by
    ? await knex("users").where("id", material.created_by).first()
    : null;

  const uploadedUser = material.uploaded_by
    ? await knex("users").where("id", material.uploaded_by).first()
    : null;

  const topic = material.kmis_topic_id
    ? await knex("kmis_topics").where("id", material.kmis_topic_id).first()
    : null;

  const file = await resolveArrayRelations(
    material.materials_file_ids,
    "documents",
    documentResource
  );

  const cover = await resolveArrayRelations(
    material.materials_cover_ids,
    "documents",
    documentResource
  );

  return {
    id: material.id,
    createdUser: createdUser ? await UserResource(createdUser) : null,
    uploadedUser: uploadedUser ? await UserResource(uploadedUser) : null,
    category: category ? await categoryResource(category) : null,
    topic: topic ? await topicResource(topic) : null,
    materialFile: file,
    materialCover: cover,
    title: material.title,
    materialTypes: material.material_types,
    materialData: material.material_data,
    description: material.description,
    isPublic: material.is_public,
    createdAt: material.created_at,
    updatedAt: material.updated_at,
    deletedAt: material.deleted_at,
  };
}

module.exports = materialResource;
