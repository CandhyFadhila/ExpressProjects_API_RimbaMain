const {
  resolveArrayRelations,
} = require("../../helpers/resolveArrayRelations");

async function RoleResource(roles) {
  const permissionKeys = await resolveArrayRelations(
    roles.permission_ids,
    "permissions",
    (row) => (row && row.key != null ? String(row.key).trim() : null)
  );

  return {
    id: roles.id,
    permissions: permissionKeys,
    name: roles.name,
    description: roles.description,
    createdAt: roles.created_at,
    updatedAt: roles.updated_at,
    deletedAt: roles.deleted_at,
  };
}

module.exports = RoleResource;
