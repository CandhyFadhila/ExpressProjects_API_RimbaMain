const knex = require("../../config/database");
const UserResource = require("../../resources/auth/UserResource");

async function monevUserResource({ userRow, isPic }) {
  const user = userRow?.id
    ? userRow
    : await knex("users").where("id", userRow.id).first();

  return {
    id: user.id,
    user: user ? await UserResource(user) : null,
    isPic: Boolean(isPic),
    createdAt: user.created_at,
    updatedAt: user.updated_at,
    deletedAt: user.deleted_at,
  };
}

module.exports = monevUserResource;
