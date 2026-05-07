// File generated from our OpenAPI spec by Stainless. See CONTRIBUTING.md for details.
import { APIResource } from "../core/resource.mjs";
import { path } from "../internal/utils/path.mjs";
/**
 * Files are used to upload documents via presigned URLs. After uploading and completing a file, link it to resources through their own APIs (e.g. attach a transcript to a meeting). See <u>[File uploads](/using-the-api/file-uploads/)</u> for the full upload flow and supported purposes. For meeting transcript attachments, see <u>[Uploading meeting transcripts](/using-the-api/uploading-meeting-transcripts/)</u>.
 */
export class File extends APIResource {
    /**
     * Creates a new file upload session and returns an upload URL.
     *
     * After uploading the file bytes to `uploadUrl`, call
     * `POST /v1/files/{id}/complete` to finalize the upload. Optionally pass `purpose`
     * to validate MIME type and size constraints at creation time. See
     * <u>[File uploads](/using-the-api/file-uploads/)</u> for the full upload flow,
     * supported purposes, and size limits. If you are uploading a meeting transcript,
     * see
     * <u>[Uploading meeting transcripts](/using-the-api/uploading-meeting-transcripts/)</u>
     * for the follow-up meeting attachment flow.
     *
     * **[Required scope](/using-the-api/scopes/):** `files:create`
     *
     * **[Rate limit category](/using-the-api/rate-limits/):** Write
     */
    create(body, options) {
        return this._client.post('/v1/files', { body, ...options });
    }
    /**
     * Retrieves a single file by its ID.
     *
     * **[Required scope](/using-the-api/scopes/):** `files:read`
     *
     * **[Rate limit category](/using-the-api/rate-limits/):** Read
     */
    retrieve(id, options) {
        return this._client.get(path `/v1/files/${id}`, options);
    }
    /**
     * Returns a paginated list of files in your workspace. Use `offset` and `limit` to
     * paginate through results. See
     * <u>[List endpoints](/using-the-api/list-endpoints/)</u> for more information
     * about pagination.
     *
     * **[Required scope](/using-the-api/scopes/):** `files:read`
     *
     * **[Rate limit category](/using-the-api/rate-limits/):** Search
     */
    list(query = {}, options) {
        return this._client.get('/v1/files', { query, ...options });
    }
    /**
     * Cancels a pending upload by transitioning the file to `CANCELLED`. Only files in
     * `PENDING` status can be cancelled. **[Required scope](/using-the-api/scopes/):**
     * `files:create`
     *
     * **[Rate limit category](/using-the-api/rate-limits/):** Write
     */
    cancel(id, params = undefined, options) {
        const { body } = params ?? {};
        return this._client.post(path `/v1/files/${id}/cancel`, { body: body, ...options });
    }
    /**
     * Finalizes an upload after the file bytes have been uploaded.
     *
     * If an optional `md5` hex digest is provided, the server validates the checksum
     * before marking the file as completed.
     *
     * **[Required scope](/using-the-api/scopes/):** `files:create`
     *
     * **[Rate limit category](/using-the-api/rate-limits/):** Write
     */
    complete(id, body, options) {
        return this._client.post(path `/v1/files/${id}/complete`, { body, ...options });
    }
    /**
     * Returns a temporary download URL for the file. Only available for files in
     * `COMPLETED` status.
     *
     * **[Required scope](/using-the-api/scopes/):** `files:read`
     *
     * **[Rate limit category](/using-the-api/rate-limits/):** Read
     */
    url(id, options) {
        return this._client.get(path `/v1/files/${id}/url`, options);
    }
}
//# sourceMappingURL=file.mjs.map