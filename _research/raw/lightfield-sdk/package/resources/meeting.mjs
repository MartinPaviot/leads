// File generated from our OpenAPI spec by Stainless. See CONTRIBUTING.md for details.
import { APIResource } from "../core/resource.mjs";
import { path } from "../internal/utils/path.mjs";
/**
 * Meetings represent synced or manually created interactions in Lightfield. Read responses are privacy-aware and may be redacted based on the caller. For transcript uploads and attachment flows, see <u>[Uploading meeting transcripts](/using-the-api/uploading-meeting-transcripts/)</u>.
 */
export class Meeting extends APIResource {
    /**
     * Creates a new meeting record. This endpoint only supports creation of meetings
     * in the past. The `$title`, `$startDate`, and `$endDate` fields are required.
     * Only the `$transcript` relationship is writable on create; all other meeting
     * relationships are system-managed. The response is privacy-aware and includes a
     * read-only `accessLevel`. See
     * <u>[Uploading meeting transcripts](/using-the-api/uploading-meeting-transcripts/)</u>
     * for the full file upload and transcript attachment flow.
     *
     * Supports idempotency via the `Idempotency-Key` header.
     *
     * **[Required scope](/using-the-api/scopes/):** `meetings:create`
     *
     * **[Rate limit category](/using-the-api/rate-limits/):** Write
     */
    create(body, options) {
        return this._client.post('/v1/meetings', { body, ...options });
    }
    /**
     * Retrieves a single meeting by its ID. Meeting fields and transcript visibility
     * are redacted based on the caller-specific privacy resolution, and the response
     * includes a read-only `accessLevel`.
     *
     * **[Required scope](/using-the-api/scopes/):** `meetings:read`
     *
     * **[Rate limit category](/using-the-api/rate-limits/):** Read
     */
    retrieve(id, options) {
        return this._client.get(path `/v1/meetings/${id}`, options);
    }
    /**
     * Updates an existing meeting by ID. Only included fields and relationships are
     * modified.
     *
     * Only `fields.$privacySetting` and `relationships.$transcript.replace` are
     * writable. Use `$transcript.replace` to set the meeting transcript. Clearing or
     * removing `$transcript` is not supported. The response is privacy-aware and
     * includes a read-only `accessLevel`. See
     * <u>[Uploading meeting transcripts](/using-the-api/uploading-meeting-transcripts/)</u>
     * for the full file upload and transcript attachment flow.
     *
     * Supports idempotency via the `Idempotency-Key` header.
     *
     * **[Required scope](/using-the-api/scopes/):** `meetings:update`
     *
     * **[Rate limit category](/using-the-api/rate-limits/):** Write
     */
    update(id, body, options) {
        return this._client.post(path `/v1/meetings/${id}`, { body, ...options });
    }
    /**
     * Returns a paginated list of meetings. Use `offset` and `limit` to paginate
     * through results. Each meeting is privacy-filtered per caller, includes a
     * read-only `accessLevel`, and may redact transcript or content fields based on
     * the caller-specific privacy resolution. See
     * <u>[List endpoints](/using-the-api/list-endpoints/)</u> for more information
     * about pagination.
     *
     * **[Required scope](/using-the-api/scopes/):** `meetings:read`
     *
     * **[Rate limit category](/using-the-api/rate-limits/):** Search
     */
    list(query = {}, options) {
        return this._client.get('/v1/meetings', { query, ...options });
    }
}
//# sourceMappingURL=meeting.mjs.map