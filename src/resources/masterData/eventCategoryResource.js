function eventCategoryResource(eventCategory) {
  return {
    id: eventCategory.id,
    name: eventCategory.name,
    description: eventCategory.description,
    createdAt: eventCategory.created_at,
    updatedAt: eventCategory.updated_at,
    deletedAt: eventCategory.deleted_at
  };
}

module.exports = eventCategoryResource;
