const ModuleResource = require("../auth/ModuleResource");
const knex = require("../../config/database");

async function PermissionResource(permission) {
  const modules = permission.module_id
    ? await knex("modules").where("id", permission.module_id).first()
    : null;

  return {
    id: permission.id,
    module: modules ? await ModuleResource(modules) : null,
    key: permission.key,
    name: permission.name,
    description: permission.description,
    createdAt: permission.created_at,
    updatedAt: permission.updated_at,
    deletedAt: permission.deleted_at,
  };
}

module.exports = PermissionResource;
