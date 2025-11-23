const {
  resolveArrayRelations,
} = require("../../helpers/resolveArrayRelations");
const knex = require("../../config/database");
const categoryResource = require("../../resources/kmis/categoryResource");
const documentResource = require("../../resources/doc/documentResource");
const materialResource = require("../../resources/kmis/materialResource");
const UserResource = require("../../resources/auth/UserResource");

async function topicResource(topic) {
  const category = topic.kmis_categories_id
    ? await knex("kmis_categories")
        .where("id", topic.kmis_categories_id)
        .first()
    : null;

  const photos = await resolveArrayRelations(
    topic.topic_cover_ids,
    "documents",
    documentResource
  );

  const materials = await knex("kmis_materials")
    .whereIn("id", topic.material_order_ids || [])
    .select("*")
    .orderByRaw(`array_position(?, id)`, [topic.material_order_ids]);

  const users = await knex("users")
    .whereIn("id", topic.user_pic || [])
    .select("*")
    .orderByRaw(`array_position(?, id)`, [topic.user_pic]);

  // Map hasil query menjadi resource material
  const materialResources = await Promise.all(
    materials.map((material) => materialResource(material))
  );

  // Map hasil query menjadi resource user
  const userPic = await Promise.all(
    users.map((user) => UserResource(user))
  );

  return {
    id: topic.id,
    userPic: userPic,
    category: category ? await categoryResource(category) : null,
    topicCover: photos,
    materialOrder: materialResources,
    topicType: topic.topic_type,
    title: topic.title,
    description: topic.description,
    totalQuiz: topic.total_quiz,
    quizDuration: topic.quiz_duration,
    totalViews: topic.total_views,
    createdAt: topic.created_at,
    updatedAt: topic.updated_at,
    deletedAt: topic.deleted_at,
  };
}

module.exports = topicResource;
