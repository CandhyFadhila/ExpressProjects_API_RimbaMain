const knex = require("../../config/database");
const { normIdArray } = require("../../helpers/inputNorm");
const UserResource = require("../../resources/auth/UserResource");

async function picDivisionResource(division) {
  const ids = normIdArray(division.user_pic, { as: "number" }).filter(
    Number.isFinite
  );

  let picUser = [];
  if (ids.length > 0) {
    const rows = await knex("users").whereIn("id", ids).select("*");
    const map = new Map(rows.map((u) => [Number(u.id), u]));
    const ordered = ids.map((id) => map.get(Number(id))).filter(Boolean);

    picUser = await Promise.all(ordered.map((u) => UserResource(u)));
  }

  return {
    id: division.id,
    picUser,
    title: division.title,
    description: division.description,
    createdAt: division.created_at,
    updatedAt: division.updated_at,
    deletedAt: division.deleted_at,
  };
}

module.exports = picDivisionResource;
