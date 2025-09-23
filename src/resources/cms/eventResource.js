const {
  resolveArrayRelations,
} = require("../../helpers/resolveArrayRelations");
const eventCategoryResource = require("../masterData/eventCategoryResource");
const knex = require("../../config/database");
const documentResource = require("../../resources/doc/documentResource");

async function eventResource(event) {
  const category = event.cms_event_category_id
    ? await knex("cms_events_categories").where("id", event.cms_event_category_id).first()
    : null;

  const thumbnail = await resolveArrayRelations(
    event.thumbnail_ids,
    "documents",
    documentResource
  );

  return {
    id: event.id,
    eventCategory: category ? await eventCategoryResource(category) : null,
    thumbnail: thumbnail,
    title: event.title,
    description: event.description,
    eventContent: event.event_content,
    createdAt: event.created_at,
    updatedAt: event.updated_at,
    deletedAt: event.deleted_at,
  };
}

module.exports = eventResource;
