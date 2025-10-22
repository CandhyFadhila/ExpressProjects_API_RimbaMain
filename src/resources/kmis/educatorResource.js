const knex = require("../../config/database");
const UserResource = require("../../resources/auth/UserResource");

async function educatorResource(educator) {
  const user = await knex("users").where("id", educator.id).first();

  const pre =
    typeof educator.total_material === "number"
      ? educator.total_material
      : null;

  let totalMaterial = pre;
  if (totalMaterial == null) {
    const countRow = await knex("kmis_materials as m")
      .whereNull("m.deleted_at")
      .andWhere(function () {
        this.where("m.uploaded_by", user.id).orWhere("m.created_by", user.id);
      })
      .count({ c: "*" })
      .first();
    totalMaterial = Number(countRow?.c ?? 0);
  }

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
