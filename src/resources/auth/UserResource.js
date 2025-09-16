const {
  resolveArrayRelations,
} = require("../../helpers/resolveArrayRelations");
const RoleResource = require("../auth/RoleResource");
const knex = require("../../config/database");
const documentResource = require("../../resources/doc/documentResource");

async function UserResource(user) {
  const role = user.role_id
    ? await knex("roles").where("id", user.role_id).first()
    : null;

  const photos = await resolveArrayRelations(
    user.photo_profile_ids,
    "documents",
    documentResource
  );

  return {
    id: user.id,

    // Relasi role
    role: role ? await RoleResource(role) : null,
    photoProfile: photos,

    // Data identitas (tanpa password)
    name: user.name,
    email: user.email,
    phoneNumber: user.phone_number,
    profession: user.profession,
    gender: user.gender,
    birthDate: user.birth_date,
    address: user.address,

    // Status akun: kode & label
    accountStatus: user.account_status,

    // Audit fields / aktivitas
    registerAt: user.register_at,
    deactiveAt: user.deactivate_at,
    lastLogin: user.last_login,
    lastChangePassword: user.last_change_password,

    createdAt: user.created_at,
    updatedAt: user.updated_at,
    deletedAt: user.deleted_at,
  };
}

module.exports = UserResource;
