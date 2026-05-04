"use strict";
// File generated from our OpenAPI spec by Stainless. See CONTRIBUTING.md for details.
Object.defineProperty(exports, "__esModule", { value: true });
exports.Opportunity = void 0;
const resource_1 = require("../core/resource.js");
const path_1 = require("../internal/utils/path.js");
/**
 * Opportunities represent potential deals or sales in Lightfield. Each opportunity belongs to an account and can have tasks and notes associated with it.
 */
class Opportunity extends resource_1.APIResource {
    /**
     * Creates a new opportunity record. The `$name` and `$stage` fields and the
     * `$account` relationship are required.
     *
     * After creation, Lightfield automatically generates an opportunity summary in the
     * background. The `$opportunityStatus` field is read-only and cannot be set via
     * the API. The `$task` and `$note` relationships are also read-only — manage them
     * via the `$opportunity` relationship on the task, or the
     * `$account`/`$opportunity` note relationships instead.
     *
     * Supports idempotency via the `Idempotency-Key` header.
     *
     * To avoid duplicates, we recommend a find-or-create pattern — use
     * <u>[list filtering](/using-the-api/list-endpoints/#filtering)</u> to check if a
     * record exists before creating.
     *
     * **[Required scope](/using-the-api/scopes/):** `opportunities:create`
     *
     * **[Rate limit category](/using-the-api/rate-limits/):** Write
     */
    create(body, options) {
        return this._client.post('/v1/opportunities', { body, ...options });
    }
    /**
     * Retrieves a single opportunity by its ID.
     *
     * **[Required scope](/using-the-api/scopes/):** `opportunities:read`
     *
     * **[Rate limit category](/using-the-api/rate-limits/):** Read
     */
    retrieve(id, options) {
        return this._client.get((0, path_1.path) `/v1/opportunities/${id}`, options);
    }
    /**
     * Updates an existing opportunity by ID. Only included fields and relationships
     * are modified.
     *
     * The `$opportunityStatus` field is read-only and cannot be updated. The `$task`
     * and `$note` relationships are also read-only — manage them via the
     * `$opportunity` relationship on the task, or the `$account`/`$opportunity` note
     * relationships instead.
     *
     * Supports idempotency via the `Idempotency-Key` header.
     *
     * **[Required scope](/using-the-api/scopes/):** `opportunities:update`
     *
     * **[Rate limit category](/using-the-api/rate-limits/):** Write
     */
    update(id, body, options) {
        return this._client.post((0, path_1.path) `/v1/opportunities/${id}`, { body, ...options });
    }
    /**
     * Returns a paginated list of opportunities. Use `offset` and `limit` to paginate
     * through results, and `$field` query parameters to filter. See
     * <u>[List endpoints](/using-the-api/list-endpoints/)</u> for more information
     * about <u>[pagination](/using-the-api/list-endpoints/#pagination)</u> and
     * <u>[filtering](/using-the-api/list-endpoints/#filtering)</u>.
     *
     * **[Required scope](/using-the-api/scopes/):** `opportunities:read`
     *
     * **[Rate limit category](/using-the-api/rate-limits/):** Search
     */
    list(query = {}, options) {
        return this._client.get('/v1/opportunities', { query, ...options });
    }
    /**
     * Returns the schema for all field and relationship definitions available on
     * opportunities, including both system-defined and custom fields. Useful for
     * understanding the shape of opportunity data before creating or updating records.
     * See <u>[Fields and relationships](/using-the-api/fields-and-relationships/)</u>
     * for more details.
     *
     * **[Required scope](/using-the-api/scopes/):** `opportunities:read`
     *
     * **[Rate limit category](/using-the-api/rate-limits/):** Read
     */
    definitions(options) {
        return this._client.get('/v1/opportunities/definitions', options);
    }
}
exports.Opportunity = Opportunity;
//# sourceMappingURL=opportunity.js.map