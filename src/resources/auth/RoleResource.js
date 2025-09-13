async function roleResource(roles) {
  return {
    id: roles.id,
    name: roles.name,
    description: roles.description,
    createdAt: roles.created_at,
    updatedAt: roles.updated_at,
    deletedAt: roles.deleted_at,
  };
}

module.exports = roleResource;
