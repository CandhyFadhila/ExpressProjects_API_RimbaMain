const {
  resolveArrayRelations,
} = require("../../helpers/resolveArrayRelations");
const knex = require("../../config/database");
const UserResource = require("../../resources/auth/UserResource");
const documentResource = require("../../resources/doc/documentResource");

async function materialResource(material) {
  const [createdUser, uploadedUser, topic] = await Promise.all([
    material.created_by
      ? await knex("users").where("id", material.created_by).first()
      : null,
    material.uploaded_by
      ? await knex("users").where("id", material.uploaded_by).first()
      : null,
    material.kmis_topic_id
      ? await knex("kmis_topics").where("id", material.kmis_topic_id).first()
      : null,
  ]);

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
    topic: topic
      ? {
          id: topic.id,
          topicType: topic.topic_type,
          title: topic.title,
          description: topic.description,
          totalQuiz: topic.total_quiz,
          quizDuration: topic.quiz_duration,
          createdAt: topic.created_at,
          updatedAt: topic.updated_at,
          deletedAt: topic.deleted_at,
        }
      : null,
    materialFiles: file,
    materialCovers: cover,
    title: material.title,
    materialType: material.material_types,
    materialUrl: material.material_data,
    description: material.description,
    createdAt: material.created_at,
    updatedAt: material.updated_at,
    deletedAt: material.deleted_at,
  };
}

module.exports = materialResource;
