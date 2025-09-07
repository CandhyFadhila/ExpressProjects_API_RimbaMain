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
    created_at: educator.created_at,
    updated_at: educator.updated_at,
    deleted_at: educator.deleted_at,
  };
}

module.exports = educatorResource;
