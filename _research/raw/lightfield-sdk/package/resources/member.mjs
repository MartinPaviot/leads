// File generated from our OpenAPI spec by Stainless. See CONTRIBUTING.md for details.
import { APIResource } from "../core/resource.mjs";
import { path } from "../internal/utils/path.mjs";
/**
 * Members represent users in your Lightfield workspace. Members can own accounts and opportunities, and are referenced in relationships like `$owner` and `$createdBy`.
 */
export class Member extends APIResource {
    /**
     * Retrieves a single member by their ID.
     *
     * **[Required scope](/using-the-api/scopes/):** `members:read`
     *
     * **[Rate limit category](/using-the-api/rate-limits/):** Read
     */
    retrieve(id, options) {
        return this._client.get(path `/v1/members/${id}`, options);
    }
    /**
     * Returns a paginated list of members in your workspace. Use `offset` and `limit`
     * to paginate through results. See
     * <u>[List endpoints](/using-the-api/list-endpoints/)</u> for more information
     * about pagination.
     *
     * **[Required scope](/using-the-api/scopes/):** `members:read`
     *
     * **[Rate limit category](/using-the-api/rate-limits/):** Search
     */
    list(query = {}, options) {
        return this._client.get('/v1/members', { query, ...options });
    }
}
//# sourceMappingURL=member.mjs.map