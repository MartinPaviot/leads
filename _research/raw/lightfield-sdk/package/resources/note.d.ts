import { APIResource } from "../core/resource.js";
import { APIPromise } from "../core/api-promise.js";
import { RequestOptions } from "../internal/request-options.js";
/**
 * Notes represent free-form text records in Lightfield. Each note can be associated with zero or more accounts and opportunities.
 */
export declare class Note extends APIResource {
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
    create(body: NoteCreateParams, options?: RequestOptions): APIPromise<NoteCreateResponse>;
    /**
     * Retrieves a single note by its ID.
     *
     * **[Required scope](/using-the-api/scopes/):** `notes:read`
     *
     * **[Rate limit category](/using-the-api/rate-limits/):** Read
     */
    retrieve(id: string, options?: RequestOptions): APIPromise<NoteRetrieveResponse>;
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
    update(id: string, body: NoteUpdateParams, options?: RequestOptions): APIPromise<NoteUpdateResponse>;
    /**
     * Returns a paginated list of notes. Use `offset` and `limit` to paginate through
     * results. See <u>[List endpoints](/using-the-api/list-endpoints/)</u> for more
     * information about pagination.
     *
     * **[Required scope](/using-the-api/scopes/):** `notes:read`
     *
     * **[Rate limit category](/using-the-api/rate-limits/):** Search
     */
    list(query?: NoteListParams | null | undefined, options?: RequestOptions): APIPromise<NoteListResponse>;
}
export interface NoteCreateResponse {
    /**
     * Unique identifier for the entity.
     */
    id: string;
    /**
     * ISO 8601 timestamp of when the entity was created.
     */
    createdAt: string;
    /**
     * Map of field names to their typed values. System fields are prefixed with `$`
     * (e.g. `$name`, `$email`); custom attributes use their bare slug.
     */
    fields: {
        [key: string]: NoteCreateResponse.Fields;
    };
    /**
     * URL to view the entity in the Lightfield web app, or null.
     */
    httpLink: string | null;
    /**
     * Map of relationship names to their associated entities. System relationships are
     * prefixed with `$` (e.g. `$owner`, `$contact`).
     */
    relationships: {
        [key: string]: NoteCreateResponse.Relationships;
    };
    /**
     * ISO 8601 timestamp of when the entity was last updated, or null.
     */
    updatedAt: string | null;
    /**
     * External identifier for the entity, or null if unset.
     */
    externalId?: string | null;
}
export declare namespace NoteCreateResponse {
    interface Fields {
        /**
         * The field value, or null if unset.
         */
        value: string | number | boolean | Array<string> | Fields.Address | Fields.FullName | null;
        /**
         * The data type of the field.
         */
        valueType: 'ADDRESS' | 'CHECKBOX' | 'CURRENCY' | 'DATETIME' | 'EMAIL' | 'FULL_NAME' | 'MARKDOWN' | 'MULTI_SELECT' | 'NUMBER' | 'SINGLE_SELECT' | 'SOCIAL_HANDLE' | 'TELEPHONE' | 'TEXT' | 'URL';
    }
    namespace Fields {
        interface Address {
            /**
             * City name.
             */
            city?: string | null;
            /**
             * 2-letter ISO 3166-1 alpha-2 country code.
             */
            country?: string | null;
            /**
             * Latitude coordinate.
             */
            latitude?: number | null;
            /**
             * Longitude coordinate.
             */
            longitude?: number | null;
            /**
             * Postal or ZIP code.
             */
            postalCode?: string | null;
            /**
             * State or province.
             */
            state?: string | null;
            /**
             * Street address line 1.
             */
            street?: string | null;
            /**
             * Street address line 2.
             */
            street2?: string | null;
        }
        interface FullName {
            /**
             * The contact's first name.
             */
            firstName?: string | null;
            /**
             * The contact's last name.
             */
            lastName?: string | null;
        }
    }
    interface Relationships {
        /**
         * Whether the relationship is `has_one` or `has_many`.
         */
        cardinality: string;
        /**
         * The type of the related object (e.g. `account`, `contact`).
         */
        objectType: string;
        /**
         * IDs of the related entities.
         */
        values: Array<string>;
    }
}
export interface NoteListResponse {
    /**
     * Array of entity objects for the current page.
     */
    data: Array<NoteListResponse.Data>;
    /**
     * The object type, always `"list"`.
     */
    object: string;
    /**
     * Total number of entities matching the query.
     */
    totalCount: number;
}
export declare namespace NoteListResponse {
    interface Data {
        /**
         * Unique identifier for the entity.
         */
        id: string;
        /**
         * ISO 8601 timestamp of when the entity was created.
         */
        createdAt: string;
        /**
         * Map of field names to their typed values. System fields are prefixed with `$`
         * (e.g. `$name`, `$email`); custom attributes use their bare slug.
         */
        fields: {
            [key: string]: Data.Fields;
        };
        /**
         * URL to view the entity in the Lightfield web app, or null.
         */
        httpLink: string | null;
        /**
         * Map of relationship names to their associated entities. System relationships are
         * prefixed with `$` (e.g. `$owner`, `$contact`).
         */
        relationships: {
            [key: string]: Data.Relationships;
        };
        /**
         * ISO 8601 timestamp of when the entity was last updated, or null.
         */
        updatedAt: string | null;
        /**
         * External identifier for the entity, or null if unset.
         */
        externalId?: string | null;
    }
    namespace Data {
        interface Fields {
            /**
             * The field value, or null if unset.
             */
            value: string | number | boolean | Array<string> | Fields.Address | Fields.FullName | null;
            /**
             * The data type of the field.
             */
            valueType: 'ADDRESS' | 'CHECKBOX' | 'CURRENCY' | 'DATETIME' | 'EMAIL' | 'FULL_NAME' | 'MARKDOWN' | 'MULTI_SELECT' | 'NUMBER' | 'SINGLE_SELECT' | 'SOCIAL_HANDLE' | 'TELEPHONE' | 'TEXT' | 'URL';
        }
        namespace Fields {
            interface Address {
                /**
                 * City name.
                 */
                city?: string | null;
                /**
                 * 2-letter ISO 3166-1 alpha-2 country code.
                 */
                country?: string | null;
                /**
                 * Latitude coordinate.
                 */
                latitude?: number | null;
                /**
                 * Longitude coordinate.
                 */
                longitude?: number | null;
                /**
                 * Postal or ZIP code.
                 */
                postalCode?: string | null;
                /**
                 * State or province.
                 */
                state?: string | null;
                /**
                 * Street address line 1.
                 */
                street?: string | null;
                /**
                 * Street address line 2.
                 */
                street2?: string | null;
            }
            interface FullName {
                /**
                 * The contact's first name.
                 */
                firstName?: string | null;
                /**
                 * The contact's last name.
                 */
                lastName?: string | null;
            }
        }
        interface Relationships {
            /**
             * Whether the relationship is `has_one` or `has_many`.
             */
            cardinality: string;
            /**
             * The type of the related object (e.g. `account`, `contact`).
             */
            objectType: string;
            /**
             * IDs of the related entities.
             */
            values: Array<string>;
        }
    }
}
export interface NoteRetrieveResponse {
    /**
     * Unique identifier for the entity.
     */
    id: string;
    /**
     * ISO 8601 timestamp of when the entity was created.
     */
    createdAt: string;
    /**
     * Map of field names to their typed values. System fields are prefixed with `$`
     * (e.g. `$name`, `$email`); custom attributes use their bare slug.
     */
    fields: {
        [key: string]: NoteRetrieveResponse.Fields;
    };
    /**
     * URL to view the entity in the Lightfield web app, or null.
     */
    httpLink: string | null;
    /**
     * Map of relationship names to their associated entities. System relationships are
     * prefixed with `$` (e.g. `$owner`, `$contact`).
     */
    relationships: {
        [key: string]: NoteRetrieveResponse.Relationships;
    };
    /**
     * ISO 8601 timestamp of when the entity was last updated, or null.
     */
    updatedAt: string | null;
    /**
     * External identifier for the entity, or null if unset.
     */
    externalId?: string | null;
}
export declare namespace NoteRetrieveResponse {
    interface Fields {
        /**
         * The field value, or null if unset.
         */
        value: string | number | boolean | Array<string> | Fields.Address | Fields.FullName | null;
        /**
         * The data type of the field.
         */
        valueType: 'ADDRESS' | 'CHECKBOX' | 'CURRENCY' | 'DATETIME' | 'EMAIL' | 'FULL_NAME' | 'MARKDOWN' | 'MULTI_SELECT' | 'NUMBER' | 'SINGLE_SELECT' | 'SOCIAL_HANDLE' | 'TELEPHONE' | 'TEXT' | 'URL';
    }
    namespace Fields {
        interface Address {
            /**
             * City name.
             */
            city?: string | null;
            /**
             * 2-letter ISO 3166-1 alpha-2 country code.
             */
            country?: string | null;
            /**
             * Latitude coordinate.
             */
            latitude?: number | null;
            /**
             * Longitude coordinate.
             */
            longitude?: number | null;
            /**
             * Postal or ZIP code.
             */
            postalCode?: string | null;
            /**
             * State or province.
             */
            state?: string | null;
            /**
             * Street address line 1.
             */
            street?: string | null;
            /**
             * Street address line 2.
             */
            street2?: string | null;
        }
        interface FullName {
            /**
             * The contact's first name.
             */
            firstName?: string | null;
            /**
             * The contact's last name.
             */
            lastName?: string | null;
        }
    }
    interface Relationships {
        /**
         * Whether the relationship is `has_one` or `has_many`.
         */
        cardinality: string;
        /**
         * The type of the related object (e.g. `account`, `contact`).
         */
        objectType: string;
        /**
         * IDs of the related entities.
         */
        values: Array<string>;
    }
}
export interface NoteUpdateResponse {
    /**
     * Unique identifier for the entity.
     */
    id: string;
    /**
     * ISO 8601 timestamp of when the entity was created.
     */
    createdAt: string;
    /**
     * Map of field names to their typed values. System fields are prefixed with `$`
     * (e.g. `$name`, `$email`); custom attributes use their bare slug.
     */
    fields: {
        [key: string]: NoteUpdateResponse.Fields;
    };
    /**
     * URL to view the entity in the Lightfield web app, or null.
     */
    httpLink: string | null;
    /**
     * Map of relationship names to their associated entities. System relationships are
     * prefixed with `$` (e.g. `$owner`, `$contact`).
     */
    relationships: {
        [key: string]: NoteUpdateResponse.Relationships;
    };
    /**
     * ISO 8601 timestamp of when the entity was last updated, or null.
     */
    updatedAt: string | null;
    /**
     * External identifier for the entity, or null if unset.
     */
    externalId?: string | null;
}
export declare namespace NoteUpdateResponse {
    interface Fields {
        /**
         * The field value, or null if unset.
         */
        value: string | number | boolean | Array<string> | Fields.Address | Fields.FullName | null;
        /**
         * The data type of the field.
         */
        valueType: 'ADDRESS' | 'CHECKBOX' | 'CURRENCY' | 'DATETIME' | 'EMAIL' | 'FULL_NAME' | 'MARKDOWN' | 'MULTI_SELECT' | 'NUMBER' | 'SINGLE_SELECT' | 'SOCIAL_HANDLE' | 'TELEPHONE' | 'TEXT' | 'URL';
    }
    namespace Fields {
        interface Address {
            /**
             * City name.
             */
            city?: string | null;
            /**
             * 2-letter ISO 3166-1 alpha-2 country code.
             */
            country?: string | null;
            /**
             * Latitude coordinate.
             */
            latitude?: number | null;
            /**
             * Longitude coordinate.
             */
            longitude?: number | null;
            /**
             * Postal or ZIP code.
             */
            postalCode?: string | null;
            /**
             * State or province.
             */
            state?: string | null;
            /**
             * Street address line 1.
             */
            street?: string | null;
            /**
             * Street address line 2.
             */
            street2?: string | null;
        }
        interface FullName {
            /**
             * The contact's first name.
             */
            firstName?: string | null;
            /**
             * The contact's last name.
             */
            lastName?: string | null;
        }
    }
    interface Relationships {
        /**
         * Whether the relationship is `has_one` or `has_many`.
         */
        cardinality: string;
        /**
         * The type of the related object (e.g. `account`, `contact`).
         */
        objectType: string;
        /**
         * IDs of the related entities.
         */
        values: Array<string>;
    }
}
export interface NoteCreateParams {
    /**
     * Field values for the new note. `$title` is required; `$content` is optional. See
     * **[Fields and relationships](/using-the-api/fields-and-relationships/)** for
     * value type details.
     */
    fields: NoteCreateParams.Fields;
    /**
     * Relationships to set on the new note. System relationships use a `$` prefix
     * (e.g. `$account`, `$opportunity`). Each value is a single entity ID or an array
     * of IDs. The note author is automatically set to the API key owner.
     */
    relationships?: NoteCreateParams.Relationships;
}
export declare namespace NoteCreateParams {
    /**
     * Field values for the new note. `$title` is required; `$content` is optional. See
     * **[Fields and relationships](/using-the-api/fields-and-relationships/)** for
     * value type details.
     */
    interface Fields {
        /**
         * Title of the note.
         */
        $title: string;
        /**
         * Content of the note as markdown formatted text.
         */
        $content?: string | null;
    }
    /**
     * Relationships to set on the new note. System relationships use a `$` prefix
     * (e.g. `$account`, `$opportunity`). Each value is a single entity ID or an array
     * of IDs. The note author is automatically set to the API key owner.
     */
    interface Relationships {
        /**
         * ID(s) of accounts to associate with this note.
         */
        $account?: string | Array<string>;
        /**
         * ID(s) of opportunities to associate with this note.
         */
        $opportunity?: string | Array<string>;
    }
}
export interface NoteUpdateParams {
    /**
     * Field values to update — only provided fields are modified; omitted fields are
     * left unchanged. See
     * **[Fields and relationships](/using-the-api/fields-and-relationships/)** for
     * value type details.
     */
    fields?: NoteUpdateParams.Fields;
    /**
     * Relationship operations to apply. System relationships use a `$` prefix (e.g.
     * `$account`, `$opportunity`). Each value is an operation object with `add` or
     * `remove`.
     */
    relationships?: NoteUpdateParams.Relationships;
}
export declare namespace NoteUpdateParams {
    /**
     * Field values to update — only provided fields are modified; omitted fields are
     * left unchanged. See
     * **[Fields and relationships](/using-the-api/fields-and-relationships/)** for
     * value type details.
     */
    interface Fields {
        /**
         * Content of the note as markdown formatted text.
         */
        $content?: string | null;
        /**
         * Title of the note.
         */
        $title?: string | null;
    }
    /**
     * Relationship operations to apply. System relationships use a `$` prefix (e.g.
     * `$account`, `$opportunity`). Each value is an operation object with `add` or
     * `remove`.
     */
    interface Relationships {
        /**
         * Operation to modify associated accounts.
         */
        $account?: Relationships.Add | Relationships.Remove;
        /**
         * Operation to modify associated opportunities.
         */
        $opportunity?: Relationships.Add | Relationships.Remove;
    }
    namespace Relationships {
        interface Add {
            /**
             * Entity ID(s) to add to the relationship.
             */
            add: string | Array<string>;
        }
        interface Remove {
            /**
             * Entity ID(s) to remove from the relationship.
             */
            remove: string | Array<string>;
        }
        interface Add {
            /**
             * Entity ID(s) to add to the relationship.
             */
            add: string | Array<string>;
        }
        interface Remove {
            /**
             * Entity ID(s) to remove from the relationship.
             */
            remove: string | Array<string>;
        }
    }
}
export interface NoteListParams {
    /**
     * Maximum number of records to return. Defaults to 25, maximum 25.
     */
    limit?: number;
    /**
     * Number of records to skip for pagination. Defaults to 0.
     */
    offset?: number;
}
export declare namespace Note {
    export { type NoteCreateResponse as NoteCreateResponse, type NoteListResponse as NoteListResponse, type NoteRetrieveResponse as NoteRetrieveResponse, type NoteUpdateResponse as NoteUpdateResponse, type NoteCreateParams as NoteCreateParams, type NoteUpdateParams as NoteUpdateParams, type NoteListParams as NoteListParams, };
}
//# sourceMappingURL=note.d.ts.map