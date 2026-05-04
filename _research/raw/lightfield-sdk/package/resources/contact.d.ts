import { APIResource } from "../core/resource.js";
import { APIPromise } from "../core/api-promise.js";
import { RequestOptions } from "../internal/request-options.js";
/**
 * Contacts represent individual people in Lightfield. Contacts can be associated with one or more accounts.
 */
export declare class Contact extends APIResource {
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
    create(body: ContactCreateParams, options?: RequestOptions): APIPromise<ContactCreateResponse>;
    /**
     * Retrieves a single contact by its ID.
     *
     * **[Required scope](/using-the-api/scopes/):** `contacts:read`
     *
     * **[Rate limit category](/using-the-api/rate-limits/):** Read
     */
    retrieve(id: string, options?: RequestOptions): APIPromise<ContactRetrieveResponse>;
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
    update(id: string, body: ContactUpdateParams, options?: RequestOptions): APIPromise<ContactUpdateResponse>;
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
    list(query?: ContactListParams | null | undefined, options?: RequestOptions): APIPromise<ContactListResponse>;
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
    definitions(options?: RequestOptions): APIPromise<ContactDefinitionsResponse>;
}
export interface ContactCreateResponse {
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
        [key: string]: ContactCreateResponse.Fields;
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
        [key: string]: ContactCreateResponse.Relationships;
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
export declare namespace ContactCreateResponse {
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
export interface ContactDefinitionsResponse {
    /**
     * Map of field keys to their definitions, including both system and custom fields.
     */
    fieldDefinitions: {
        [key: string]: ContactDefinitionsResponse.FieldDefinitions;
    };
    /**
     * The object type these definitions belong to (e.g. `account`).
     */
    objectType: string;
    /**
     * Map of relationship keys to their definitions.
     */
    relationshipDefinitions: {
        [key: string]: ContactDefinitionsResponse.RelationshipDefinitions;
    };
}
export declare namespace ContactDefinitionsResponse {
    interface FieldDefinitions {
        /**
         * Description of the field, or null.
         */
        description: string | null;
        /**
         * Human-readable display name of the field.
         */
        label: string;
        /**
         * Type-specific configuration (e.g. select options, currency code).
         */
        typeConfiguration: FieldDefinitions.TypeConfiguration;
        /**
         * Data type of the field.
         */
        valueType: 'ADDRESS' | 'CHECKBOX' | 'CURRENCY' | 'DATETIME' | 'EMAIL' | 'FULL_NAME' | 'MARKDOWN' | 'MULTI_SELECT' | 'NUMBER' | 'SINGLE_SELECT' | 'SOCIAL_HANDLE' | 'TELEPHONE' | 'TEXT' | 'URL';
        /**
         * Unique identifier of the field definition.
         */
        id?: string;
        /**
         * `true` for fields that are not writable via the API (e.g. AI-generated
         * summaries). `false` or absent for writable fields.
         */
        readOnly?: boolean;
    }
    namespace FieldDefinitions {
        /**
         * Type-specific configuration (e.g. select options, currency code).
         */
        interface TypeConfiguration {
            /**
             * ISO 4217 3-letter currency code.
             */
            currency?: string;
            /**
             * Social platform associated with this handle field.
             */
            handleService?: 'TWITTER' | 'LINKEDIN' | 'FACEBOOK' | 'INSTAGRAM';
            /**
             * Whether this field accepts multiple values.
             */
            multipleValues?: boolean;
            /**
             * Available options for select fields.
             */
            options?: Array<TypeConfiguration.Option>;
            /**
             * Whether values for this field must be unique.
             */
            unique?: boolean;
        }
        namespace TypeConfiguration {
            interface Option {
                /**
                 * Unique identifier of the select option.
                 */
                id: string;
                /**
                 * Human-readable display name of the option.
                 */
                label: string;
                /**
                 * Description of the option, or null.
                 */
                description?: string | null;
            }
        }
    }
    interface RelationshipDefinitions {
        /**
         * Whether this is a `has_one` or `has_many` relationship.
         */
        cardinality: 'HAS_ONE' | 'HAS_MANY';
        /**
         * Description of the relationship, or null.
         */
        description: string | null;
        /**
         * Human-readable display name of the relationship.
         */
        label: string;
        /**
         * The type of the related object (e.g. `account`, `contact`).
         */
        objectType: string;
        /**
         * Unique identifier of the relationship definition.
         */
        id?: string;
    }
}
export interface ContactListResponse {
    /**
     * Array of entity objects for the current page.
     */
    data: Array<ContactListResponse.Data>;
    /**
     * The object type, always `"list"`.
     */
    object: string;
    /**
     * Total number of entities matching the query.
     */
    totalCount: number;
}
export declare namespace ContactListResponse {
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
export interface ContactRetrieveResponse {
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
        [key: string]: ContactRetrieveResponse.Fields;
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
        [key: string]: ContactRetrieveResponse.Relationships;
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
export declare namespace ContactRetrieveResponse {
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
export interface ContactUpdateResponse {
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
        [key: string]: ContactUpdateResponse.Fields;
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
        [key: string]: ContactUpdateResponse.Relationships;
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
export declare namespace ContactUpdateResponse {
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
export interface ContactCreateParams {
    /**
     * Field values for the new contact. System fields use a `$` prefix (e.g. `$email`,
     * `$name`); custom attributes use their bare slug. Note: `$name` is an object
     * `{ firstName, lastName }`, not a plain string. Call the
     * <u>[definitions endpoint](/api/resources/contact/methods/definitions)</u> to
     * discover available fields and their types. See
     * <u>[Fields and relationships](/using-the-api/fields-and-relationships/)</u> for
     * value type details.
     */
    fields: {
        [key: string]: string | number | boolean | Array<string> | ContactCreateParams.Address | ContactCreateParams.FullName | null;
    };
    /**
     * Relationships to set on the new contact. System relationships use a `$` prefix
     * (e.g. `$account`); custom relationships use their bare slug. Each value is a
     * single entity ID or an array of IDs. Call the
     * <u>[definitions endpoint](/api/resources/contact/methods/definitions)</u> to
     * list available relationship keys.
     */
    relationships?: {
        [key: string]: string | Array<string>;
    };
}
export declare namespace ContactCreateParams {
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
export interface ContactUpdateParams {
    /**
     * Field values to update — only provided fields are modified; omitted fields are
     * left unchanged. System fields use a `$` prefix (e.g. `$email`); custom
     * attributes use their bare slug. Note: `$name` is an object
     * `{ firstName, lastName }`, not a plain string. Call the
     * <u>[definitions endpoint](/api/resources/contact/methods/definitions)</u> for
     * available fields and types. See
     * <u>[Fields and relationships](/using-the-api/fields-and-relationships/)</u> for
     * value type details.
     */
    fields?: {
        [key: string]: string | number | boolean | Array<string> | ContactUpdateParams.Address | ContactUpdateParams.FullName | null;
    };
    /**
     * Relationship operations to apply. System relationships use a `$` prefix (e.g.
     * `$account`). Each value is an operation object with `add`, `remove`, or
     * `replace`.
     */
    relationships?: {
        [key: string]: ContactUpdateParams.Relationships;
    };
}
export declare namespace ContactUpdateParams {
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
    /**
     * An operation to modify a relationship. Provide one of `add`, `remove`, or
     * `replace`.
     */
    interface Relationships {
        /**
         * Entity ID(s) to add to the relationship.
         */
        add?: string | Array<string>;
        /**
         * Entity ID(s) to remove from the relationship.
         */
        remove?: string | Array<string>;
        /**
         * Entity ID(s) to set as the entire relationship, replacing all existing
         * associations.
         */
        replace?: string | Array<string>;
    }
}
export interface ContactListParams {
    /**
     * Maximum number of records to return. Defaults to 25, maximum 25.
     */
    limit?: number;
    /**
     * Number of records to skip for pagination. Defaults to 0.
     */
    offset?: number;
}
export declare namespace Contact {
    export { type ContactCreateResponse as ContactCreateResponse, type ContactDefinitionsResponse as ContactDefinitionsResponse, type ContactListResponse as ContactListResponse, type ContactRetrieveResponse as ContactRetrieveResponse, type ContactUpdateResponse as ContactUpdateResponse, type ContactCreateParams as ContactCreateParams, type ContactUpdateParams as ContactUpdateParams, type ContactListParams as ContactListParams, };
}
//# sourceMappingURL=contact.d.ts.map