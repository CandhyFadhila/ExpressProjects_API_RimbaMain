async function ModuleResource(modules) {
  return {
    id: modules.id,
    name: modules.name,
    description: modules.description,
    createdAt: modules.created_at,
    updatedAt: modules.updated_at,
    deletedAt: modules.deleted_at,
  };
}

module.exports = ModuleResource;
