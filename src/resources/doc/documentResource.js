function documentResource(doc) {
  return {
    id: doc.id,
    uploadedBy: doc.uploaded_by,
    verifiedBy: doc.verified_by,
    fileId: doc.file_id,
    fileName: doc.file_name,
    filePath: doc.file_path,
    fileUrl: doc.file_url,
    fileMimeType: doc.file_mime_type,
    fileSize: doc.file_size,
    createdAt: doc.created_at,
    updatedAt: doc.updated_at,
    deletedAt: doc.deleted_at
  };
}

module.exports = documentResource;
