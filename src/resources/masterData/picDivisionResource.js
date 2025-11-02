async function picDivisionResource(division) {
  return {
    id: division.id,
    userPic: division.user_pic,
    title: division.title,
    description: division.description,
    createdAt: division.created_at,
    updatedAt: division.updated_at,
    deletedAt: division.deleted_at,
  };
}

module.exports = picDivisionResource;
