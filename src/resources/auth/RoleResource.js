async function roleResource(roles) {
  return {
    id: roles.id,
    name: roles.name,
    description: roles.description,
    created_at: roles.created_at,
    updated_at: roles.updated_at,
    deleted_at: roles.deleted_at,
  };
}

module.exports = roleResource;
