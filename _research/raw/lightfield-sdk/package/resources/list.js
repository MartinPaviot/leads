"use strict";
// File generated from our OpenAPI spec by Stainless. See CONTRIBUTING.md for details.
Object.defineProperty(exports, "__esModule", { value: true });
exports.List = void 0;
const resource_1 = require("../core/resource.js");
const path_1 = require("../internal/utils/path.js");
/**
 * Lists are curated collections of accounts, contacts, or opportunities in Lightfield. Each list contains entities of a single type.
 */
class List extends resource_1.APIResource {
    /**
     * Creates a new list. The `$name` and `$objectType` fields are required.
     *
     * Supports idempotency via the `Idempotency-Key` header.
     *
     * **[Required scope](/using-the-api/scopes/):** `lists:create`
     *
     * **[Rate limit category](/using-the-api/rate-limits/):** Write
     */
    create(body, options) {
        return this._client.post('/v1/lists', { body, ...options });
    }
    /**
     * Retrieves a single list by its ID.
     *
     * **[Required scope](/using-the-api/scopes/):** `lists:read`
     *
     * **[Rate limit category](/using-the-api/rate-limits/):** Read
     */
    retrieve(id, options) {
        return this._client.get((0, path_1.path) `/v1/lists/${id}`, options);
    }
    /**
     * Updates an existing list by ID. Only included fields are modified.
     *
     * Supports idempotency via the `Idempotency-Key` header.
     *
     * **[Required scope](/using-the-api/scopes/):** `lists:update`
     *
     * **[Rate limit category](/using-the-api/rate-limits/):** Write
     */
    update(id, body, options) {
        return this._client.post((0, path_1.path) `/v1/lists/${id}`, { body, ...options });
    }
    /**
     * Returns a paginated list of lists. Use `offset` and `limit` to paginate through
     * results. See <u>[List endpoints](/using-the-api/list-endpoints/)</u> for more
     * information about pagination.
     *
     * **[Required scope](/using-the-api/scopes/):** `lists:read`
     *
     * **[Rate limit category](/using-the-api/rate-limits/):** Search
     */
    list(query = {}, options) {
        return this._client.get('/v1/lists', { query, ...options });
    }
    /**
     * Returns a paginated list of accounts that belong to the specified list.
     *
     * **[Required scopes](/using-the-api/scopes/):** `lists:read` and `accounts:read`
     *
     * **[Rate limit category](/using-the-api/rate-limits/):** Search
     */
    listAccounts(listID, query = {}, options) {
        return this._client.get((0, path_1.path) `/v1/lists/${listID}/accounts`, { query, ...options });
    }
    /**
     * Returns a paginated list of contacts that belong to the specified list.
     *
     * **[Required scopes](/using-the-api/scopes/):** `lists:read` and `contacts:read`
     *
     * **[Rate limit category](/using-the-api/rate-limits/):** Search
     */
    listContacts(listID, query = {}, options) {
        return this._client.get((0, path_1.path) `/v1/lists/${listID}/contacts`, { query, ...options });
    }
    /**
     * Returns a paginated list of opportunities that belong to the specified list.
     *
     * **[Required scopes](/using-the-api/scopes/):** `lists:read` and
     * `opportunities:read`
     *
     * **[Rate limit category](/using-the-api/rate-limits/):** Search
     */
    listOpportunities(listID, query = {}, options) {
        return this._client.get((0, path_1.path) `/v1/lists/${listID}/opportunities`, { query, ...options });
    }
}
exports.List = List;
//# sourceMappingURL=list.js.map