"use strict";
// File generated from our OpenAPI spec by Stainless. See CONTRIBUTING.md for details.
Object.defineProperty(exports, "__esModule", { value: true });
exports.Task = void 0;
const resource_1 = require("../core/resource.js");
const path_1 = require("../internal/utils/path.js");
/**
 * Tasks represent action items in Lightfield. Each task belongs to an account, is assigned to a member, and can optionally be associated with an opportunity.
 */
class Task extends resource_1.APIResource {
    /**
     * Creates a new task record. The `$title` and `$status` fields and the
     * `$assignedTo` relationship are required.
     *
     * If `$createdBy` is omitted it defaults to the authenticated user. The `$note`
     * relationship is read-only — manage notes via their own relationships.
     *
     * Supports idempotency via the `Idempotency-Key` header.
     *
     * **[Required scope](/using-the-api/scopes/):** `tasks:create`
     *
     * **[Rate limit category](/using-the-api/rate-limits/):** Write
     */
    create(body, options) {
        return this._client.post('/v1/tasks', { body, ...options });
    }
    /**
     * Retrieves a single task by its ID.
     *
     * **[Required scope](/using-the-api/scopes/):** `tasks:read`
     *
     * **[Rate limit category](/using-the-api/rate-limits/):** Read
     */
    retrieve(id, options) {
        return this._client.get((0, path_1.path) `/v1/tasks/${id}`, options);
    }
    /**
     * Updates an existing task by ID. Only included fields and relationships are
     * modified.
     *
     * The `$note` relationship is read-only — manage notes via their own
     * relationships.
     *
     * Supports idempotency via the `Idempotency-Key` header.
     *
     * **[Required scope](/using-the-api/scopes/):** `tasks:update`
     *
     * **[Rate limit category](/using-the-api/rate-limits/):** Write
     */
    update(id, body, options) {
        return this._client.post((0, path_1.path) `/v1/tasks/${id}`, { body, ...options });
    }
    /**
     * Returns a paginated list of tasks. Use `offset` and `limit` to paginate through
     * results. See <u>[List endpoints](/using-the-api/list-endpoints/)</u> for more
     * information about pagination.
     *
     * **[Required scope](/using-the-api/scopes/):** `tasks:read`
     *
     * **[Rate limit category](/using-the-api/rate-limits/):** Search
     */
    list(query = {}, options) {
        return this._client.get('/v1/tasks', { query, ...options });
    }
    /**
     * Returns the schema for the field and relationship definitions available on
     * tasks. Useful for understanding the shape of task data before creating or
     * updating records. See
     * <u>[Fields and relationships](/using-the-api/fields-and-relationships/)</u> for
     * more details.
     *
     * **[Required scope](/using-the-api/scopes/):** `tasks:read`
     *
     * **[Rate limit category](/using-the-api/rate-limits/):** Read
     */
    definitions(options) {
        return this._client.get('/v1/tasks/definitions', options);
    }
}
exports.Task = Task;
//# sourceMappingURL=task.js.map