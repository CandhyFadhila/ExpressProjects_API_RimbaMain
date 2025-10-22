const {
  resolveArrayRelations,
} = require("../../helpers/resolveArrayRelations");
const knex = require("../../config/database");
const categoryResource = require("../../resources/kmis/categoryResource");
const documentResource = require("../../resources/doc/documentResource");
const materialResource = require("../../resources/kmis/materialResource");

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
    .select(
      "id",
      "kmis_topic_id",
      "materials_file_ids",
      "materials_cover_ids",
      "title",
      "material_types",
      "material_data",
      "description",
      "is_public"
    )
    .orderByRaw(
      `array_position(?, id)`,
      [topic.material_order_ids]
    );

  // Map hasil query menjadi resource material
  const materialResources = await Promise.all(
    materials.map((material) => materialResource(material)) // Apply materialResource here for each material
  );

  return {
    id: topic.id,
    category: category ? await categoryResource(category) : null,
    topicCover: photos,
    materialOrder: materialResources,
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
