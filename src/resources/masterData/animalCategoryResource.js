async function animalCategoryResource(animalCategory) {
  return {
    id: animalCategory.id,
    name: animalCategory.name,
    description: animalCategory.description,
    createdAt: animalCategory.created_at,
    updatedAt: animalCategory.updated_at,
    deletedAt: animalCategory.deleted_at
  };
}

module.exports = animalCategoryResource;
