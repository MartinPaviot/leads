"use strict";
// File generated from our OpenAPI spec by Stainless. See CONTRIBUTING.md for details.
Object.defineProperty(exports, "__esModule", { value: true });
exports.Note = void 0;
const resource_1 = require("../core/resource.js");
const path_1 = require("../internal/utils/path.js");
/**
 * Notes represent free-form text records in Lightfield. Each note can be associated with zero or more accounts and opportunities.
 */
class Note extends resource_1.APIResource {
    /**
     * Creates a new note record.
     *
     * The note author is automatically set to the API key owner.
     *
     * Supports idempotency via the `Idempotency-Key` header.
     *
     * **[Required scope](/using-the-api/scopes/):** `notes:create`
     *
     * **[Rate limit category](/using-the-api/rate-limits/):** Write
     */
    create(body, options) {
        return this._client.post('/v1/notes', { body, ...options });
    }
    /**
     * Retrieves a single note by its ID.
     *
     * **[Required scope](/using-the-api/scopes/):** `notes:read`
     *
     * **[Rate limit category](/using-the-api/rate-limits/):** Read
     */
    retrieve(id, options) {
        return this._client.get((0, path_1.path) `/v1/notes/${id}`, options);
    }
    /**
     * Updates an existing note by ID. Only included fields and relationships are
     * modified.
     *
     * Both `$account` and `$opportunity` relationships can be modified via `add` or
     * `remove` operations.
     *
     * Supports idempotency via the `Idempotency-Key` header.
     *
     * **[Required scope](/using-the-api/scopes/):** `notes:update`
     *
     * **[Rate limit category](/using-the-api/rate-limits/):** Write
     */
    update(id, body, options) {
        return this._client.post((0, path_1.path) `/v1/notes/${id}`, { body, ...options });
    }
    /**
     * Returns a paginated list of notes. Use `offset` and `limit` to paginate through
     * results. See <u>[List endpoints](/using-the-api/list-endpoints/)</u> for more
     * information about pagination.
     *
     * **[Required scope](/using-the-api/scopes/):** `notes:read`
     *
     * **[Rate limit category](/using-the-api/rate-limits/):** Search
     */
    list(query = {}, options) {
        return this._client.get('/v1/notes', { query, ...options });
    }
}
exports.Note = Note;
//# sourceMappingURL=note.js.map