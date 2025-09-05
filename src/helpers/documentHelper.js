const knex = require("../config/database");
const StorageServerHelper = require("../helpers/storageServerHelper");
const logger = require("../utils/logger");

class DocumentHelper {
  static async uploadDocuments(files, req) {
    const documentIds = [];
    const userId = req.auth?.userId ?? req.auth?.user_id ?? req.auth?.id ?? req.userId ?? req.user?.id;
    try {
      const uploadedFiles = await StorageServerHelper.uploadToServer(files);

      if (Array.isArray(uploadedFiles) && uploadedFiles.length > 0) {
        // Loop untuk setiap file yang berhasil diupload
        for (const uploadedFile of uploadedFiles) {
          if (uploadedFile && uploadedFile.server_file_id) {
            const [{ id }] = await knex("documents")
              .insert({
                uploaded_by: userId,
                verified_by: 1,
                file_id: uploadedFile.server_file_id,
                file_name: uploadedFile.server_file_name,
                file_path: uploadedFile.server_file_path,
                file_url: uploadedFile.server_file_url,
                file_mime_type: uploadedFile.server_file_mime_type,
                file_size: uploadedFile.server_file_size,
              })
              .returning(["id"]);

            documentIds.push(Number(id));
            logger.info("| DocumentHelper | - Document uploaded successfully", {
              file_name: uploadedFile.server_file_name,
              file_size: uploadedFile.server_file_size,
              document_id: id,
            });
          } else {
            logger.error(
              "| DocumentHelper | - Failed to save document. No file_id in response.",
              uploadedFile
            );
          }
        }
      } else {
        logger.error(
          "| DocumentHelper | - Invalid upload response format.",
          uploadedFiles
        );
      }
    } catch (error) {
      logger.error("| Document Helper | - Error during document upload", {
        error: error.message,
      });
      throw new Error("Failed to upload documents.");
    }

    return documentIds;
  }

  static async deleteDocuments(documentIdsToDelete) {
    try {
      // Ambil file_ids dari dokumen yang akan dihapus
      const documents = await knex("documents")
        .select("file_id")
        .whereIn("id", documentIdsToDelete);

      const fileIds = documents.map(doc => doc.file_id);

      // 1) Soft delete database dulu
      await knex("documents")
        .whereIn("id", documentIdsToDelete)
        .update({ deleted_at: knex.fn.now() });

      // 2) Setelah commit, baru hapus file di storage server
      if (fileIds.length > 0) {
        const res = await StorageServerHelper.deleteFromServer(fileIds);
        logger.info("| DocumentHelper | - Documents deleted from storage.", {
          file_ids: fileIds,
          document_ids: documentIdsToDelete,
          result: res
        });
      }
    } catch (error) {
      logger.error("| Document Helper | - Failed to delete document from storage.", {
        error: error.message
      });
      throw new Error("Failed to delete documents.");
    }
  }
}

module.exports = DocumentHelper;
