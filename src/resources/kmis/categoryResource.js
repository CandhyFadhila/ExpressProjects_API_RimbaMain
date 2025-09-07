const {
  resolveArrayRelations,
} = require("../../helpers/resolveArrayRelations");
const documentResource = require("../../resources/doc/documentResource");

async function categoryResource(category) {
  const photos = await resolveArrayRelations(
    category.category_cover_ids,
    "documents",
    documentResource
  );

  return {
    id: category.id,
    categoryCover: photos,
    title: category.title,
    description: category.description,
    createdAt: category.created_at,
    updatedAt: category.updated_at,
    deletedAt: category.deleted_at,
  };
}

module.exports = categoryResource;
