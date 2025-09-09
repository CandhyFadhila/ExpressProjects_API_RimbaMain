const knex = require("../../config/database");
const UserResource = require("../../resources/auth/UserResource");

async function educatorResource(educator) {
  const user = await knex("users").where("id", educator.id).first();

  const countRow = await knex("kmis_materials")
    .where("created_by", user.id)
    .whereNull("deleted_at")
    .count({ c: "*" })
    .first();

  const pre =
    typeof educator.total_material === "number"
      ? educator.total_material
      : null;
  const totalMaterial = pre ?? Number(countRow?.c ?? 0);

  return {
    id: user.id,
    user: user ? await UserResource(user) : null,
    totalMaterial,
    createdAt: educator.created_at,
    updatedAt: educator.updated_at,
    deletedAt: educator.deleted_at,
  };
}

module.exports = educatorResource;
