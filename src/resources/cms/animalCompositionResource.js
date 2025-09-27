const {
  resolveArrayRelations,
} = require("../../helpers/resolveArrayRelations");
const animalCategoryResource = require("../masterData/animalCategoryResource");
const knex = require("../../config/database");
const documentResource = require("../../resources/doc/documentResource");

async function animalCompositionResource(animalComposition) {
  const category = animalComposition.cms_animal_category_id
    ? await knex("cms_animal_categories").where("id", animalComposition.cms_animal_category_id).first()
    : null;

  const images = await resolveArrayRelations(
    animalComposition.species_image_ids,
    "documents",
    documentResource
  );

  return {
    id: animalComposition.id,
    animalCategory: category ? await animalCategoryResource(category) : null,
    speciesImage: images,
    name: animalComposition.name,
    description: animalComposition.description,
    total: animalComposition.total,
    createdAt: animalComposition.created_at,
    updatedAt: animalComposition.updated_at,
    deletedAt: animalComposition.deleted_at,
  };
}

module.exports = animalCompositionResource;
