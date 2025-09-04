const {
  resolveArrayRelations,
} = require("../../helpers/resolveArrayRelations");
const roleResource = require("../auth/RoleResource");
const knex = require("../../config/database");

async function userResource(user) {
  const role = user.role_id
    ? await knex("roles").where({ id: user.role_id }).first()
    : null;

  const photos = await resolveArrayRelations(
    user.photo_profile_ids,
    "documents"
  );

  return {
    id: user.id,

    // Relasi role
    role: role ? await roleResource(role) : null,
    photo_profile: photos,

    // Data identitas (tanpa password)
    name: user.name,
    email: user.email,
    phone_number: user.phone_number ?? null,
    profession: user.profession ?? null,
    gender: user.gender,
    birth_date: user.birth_date ?? null,
    address: user.address ?? null,

    // Status akun: kode & label
    account_status: user.account_status,

    // Audit fields / aktivitas
    register_at: user.register_at ?? null,
    deactivate_at: user.deactivate_at ?? null,
    last_login: user.last_login ?? null,
    last_change_password: user.last_change_password ?? null,

    created_at: user.created_at,
    updated_at: user.updated_at,
    deleted_at: user.deleted_at,
  };
}

module.exports = userResource;
