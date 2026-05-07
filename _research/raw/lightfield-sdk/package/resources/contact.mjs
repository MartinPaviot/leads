// File generated from our OpenAPI spec by Stainless. See CONTRIBUTING.md for details.
import { APIResource } from "../core/resource.mjs";
import { path } from "../internal/utils/path.mjs";
/**
 * Contacts represent individual people in Lightfield. Contacts can be associated with one or more accounts.
 */
export class Contact extends APIResource {
    /**
     * Creates a new contact record.
     *
     * After creation, Lightfield automatically enriches the contact in the background.
     *
     * Supports idempotency via the `Idempotency-Key` header.
     *
     * To avoid duplicates, we recommend a find-or-create pattern — use
     * <u>[list filtering](/using-the-api/list-endpoints/#filtering)</u> to check if a
     * record exists before creating.
     *
     * **[Required scope](/using-the-api/scopes/):** `contacts:create`
     *
     * **[Rate limit category](/using-the-api/rate-limits/):** Write
     */
    create(body, options) {
        return this._client.post('/v1/contacts', { body, ...options });
    }
    /**
     * Retrieves a single contact by its ID.
     *
     * **[Required scope](/using-the-api/scopes/):** `contacts:read`
     *
     * **[Rate limit category](/using-the-api/rate-limits/):** Read
     */
    retrieve(id, options) {
        return this._client.get(path `/v1/contacts/${id}`, options);
    }
    /**
     * Updates an existing contact by ID. Only included fields and relationships are
     * modified.
     *
     * Supports idempotency via the `Idempotency-Key` header.
     *
     * **[Required scope](/using-the-api/scopes/):** `contacts:update`
     *
     * **[Rate limit category](/using-the-api/rate-limits/):** Write
     */
    update(id, body, options) {
        return this._client.post(path `/v1/contacts/${id}`, { body, ...options });
    }
    /**
     * Returns a paginated list of contacts. Use `offset` and `limit` to paginate
     * through results, and `$field` query parameters to filter. See
     * <u>[List endpoints](/using-the-api/list-endpoints/)</u> for more information
     * about <u>[pagination](/using-the-api/list-endpoints/#pagination)</u> and
     * <u>[filtering](/using-the-api/list-endpoints/#filtering)</u>.
     *
     * **[Required scope](/using-the-api/scopes/):** `contacts:read`
     *
     * **[Rate limit category](/using-the-api/rate-limits/):** Search
     */
    list(query = {}, options) {
        return this._client.get('/v1/contacts', { query, ...options });
    }
    /**
     * Returns the schema for all field and relationship definitions available on
     * contacts, including both system-defined and custom fields. Useful for
     * understanding the shape of contact data before creating or updating records. See
     * <u>[Fields and relationships](/using-the-api/fields-and-relationships/)</u> for
     * more details.
     *
     * **[Required scope](/using-the-api/scopes/):** `contacts:read`
     *
     * **[Rate limit category](/using-the-api/rate-limits/):** Read
     */
    definitions(options) {
        return this._client.get('/v1/contacts/definitions', options);
    }
}
//# sourceMappingURL=contact.mjs.map