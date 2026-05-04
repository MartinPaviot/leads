// File generated from our OpenAPI spec by Stainless. See CONTRIBUTING.md for details.
import { APIResource } from "../core/resource.mjs";
import { path } from "../internal/utils/path.mjs";
/**
 * Accounts represent companies or organizations in Lightfield. Each account can have contacts, opportunities, tasks, and notes associated with it.
 */
export class Account extends APIResource {
    /**
     * Creates a new account record. The `$name` field is required.
     *
     * If a `$website` is provided, Lightfield automatically enriches the account in
     * the background. The `$howTheyMakeMoney` and `$accountStatus` fields are
     * read-only and cannot be set via the API. The `$opportunity`, `$task`, and
     * `$note` relationships are also read-only — manage them via the `$account`
     * relationship on the opportunity or task, or the `$account`/`$opportunity` note
     * relationships instead.
     *
     * Supports idempotency via the `Idempotency-Key` header.
     *
     * To avoid duplicates, we recommend a find-or-create pattern — use
     * <u>[list filtering](/using-the-api/list-endpoints/#filtering)</u> to check if a
     * record exists before creating.
     *
     * **[Required scope](/using-the-api/scopes/):** `accounts:create`
     *
     * **[Rate limit category](/using-the-api/rate-limits/):** Write
     */
    create(body, options) {
        return this._client.post('/v1/accounts', { body, ...options });
    }
    /**
     * Retrieves a single account by its ID.
     *
     * **[Required scope](/using-the-api/scopes/):** `accounts:read`
     *
     * **[Rate limit category](/using-the-api/rate-limits/):** Read
     */
    retrieve(id, options) {
        return this._client.get(path `/v1/accounts/${id}`, options);
    }
    /**
     * Updates an existing account by ID. Only included fields and relationships are
     * modified.
     *
     * The `$howTheyMakeMoney` and `$accountStatus` fields are read-only and cannot be
     * updated. The `$opportunity`, `$task`, and `$note` relationships are also
     * read-only — manage them via the `$account` relationship on the opportunity or
     * task, or the `$account`/`$opportunity` note relationships instead.
     *
     * Supports idempotency via the `Idempotency-Key` header.
     *
     * **[Required scope](/using-the-api/scopes/):** `accounts:update`
     *
     * **[Rate limit category](/using-the-api/rate-limits/):** Write
     */
    update(id, body, options) {
        return this._client.post(path `/v1/accounts/${id}`, { body, ...options });
    }
    /**
     * Returns a paginated list of accounts. Use `offset` and `limit` to paginate
     * through results, and `$field` query parameters to filter. See
     * <u>[List endpoints](/using-the-api/list-endpoints/)</u> for more information
     * about <u>[pagination](/using-the-api/list-endpoints/#pagination)</u> and
     * <u>[filtering](/using-the-api/list-endpoints/#filtering)</u>.
     *
     * **[Required scope](/using-the-api/scopes/):** `accounts:read`
     *
     * **[Rate limit category](/using-the-api/rate-limits/):** Search
     */
    list(query = {}, options) {
        return this._client.get('/v1/accounts', { query, ...options });
    }
    /**
     * Returns the schema for all field and relationship definitions available on
     * accounts, including both system-defined and custom fields. Useful for
     * understanding the shape of account data before creating or updating records. See
     * <u>[Fields and relationships](/using-the-api/fields-and-relationships/)</u> for
     * more details.
     *
     * **[Required scope](/using-the-api/scopes/):** `accounts:read`
     *
     * **[Rate limit category](/using-the-api/rate-limits/):** Read
     */
    definitions(options) {
        return this._client.get('/v1/accounts/definitions', options);
    }
}
//# sourceMappingURL=account.mjs.map