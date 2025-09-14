const userResource = require("../auth/UserResource");

async function activityLogResource(activity, user = null) {
  return {
    id: activity.id,
    user: user ? await userResource(user) : null,
    module: activity.module,
    key: activity.key,
    description: activity.description,
    createdAt: activity.created_at,
    updatedAt: activity.updated_at,
    deletedAt: activity.deleted_at,
  };
}

module.exports = activityLogResource;
