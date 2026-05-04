import { APIResource } from "../core/resource.mjs";
import { APIPromise } from "../core/api-promise.mjs";
import { RequestOptions } from "../internal/request-options.mjs";
/**
 * Opportunities represent potential deals or sales in Lightfield. Each opportunity belongs to an account and can have tasks and notes associated with it.
 */
export declare class Opportunity extends APIResource {
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
    create(body: OpportunityCreateParams, options?: RequestOptions): APIPromise<OpportunityCreateResponse>;
    /**
     * Retrieves a single opportunity by its ID.
     *
     * **[Required scope](/using-the-api/scopes/):** `opportunities:read`
     *
     * **[Rate limit category](/using-the-api/rate-limits/):** Read
     */
    retrieve(id: string, options?: RequestOptions): APIPromise<OpportunityRetrieveResponse>;
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
    update(id: string, body: OpportunityUpdateParams, options?: RequestOptions): APIPromise<OpportunityUpdateResponse>;
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
    list(query?: OpportunityListParams | null | undefined, options?: RequestOptions): APIPromise<OpportunityListResponse>;
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
    definitions(options?: RequestOptions): APIPromise<OpportunityDefinitionsResponse>;
}
export interface OpportunityCreateResponse {
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
        [key: string]: OpportunityCreateResponse.Fields;
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
        [key: string]: OpportunityCreateResponse.Relationships;
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
export declare namespace OpportunityCreateResponse {
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
export interface OpportunityDefinitionsResponse {
    /**
     * Map of field keys to their definitions, including both system and custom fields.
     */
    fieldDefinitions: {
        [key: string]: OpportunityDefinitionsResponse.FieldDefinitions;
    };
    /**
     * The object type these definitions belong to (e.g. `account`).
     */
    objectType: string;
    /**
     * Map of relationship keys to their definitions.
     */
    relationshipDefinitions: {
        [key: string]: OpportunityDefinitionsResponse.RelationshipDefinitions;
    };
}
export declare namespace OpportunityDefinitionsResponse {
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
export interface OpportunityListResponse {
    /**
     * Array of entity objects for the current page.
     */
    data: Array<OpportunityListResponse.Data>;
    /**
     * The object type, always `"list"`.
     */
    object: string;
    /**
     * Total number of entities matching the query.
     */
    totalCount: number;
}
export declare namespace OpportunityListResponse {
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
export interface OpportunityRetrieveResponse {
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
        [key: string]: OpportunityRetrieveResponse.Fields;
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
        [key: string]: OpportunityRetrieveResponse.Relationships;
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
export declare namespace OpportunityRetrieveResponse {
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
export interface OpportunityUpdateResponse {
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
        [key: string]: OpportunityUpdateResponse.Fields;
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
        [key: string]: OpportunityUpdateResponse.Relationships;
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
export declare namespace OpportunityUpdateResponse {
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
export interface OpportunityCreateParams {
    /**
     * Field values for the new opportunity. System fields use a `$` prefix (e.g.
     * `$name`, `$stage`); custom attributes use their bare slug. Required: `$name`
     * (string) and `$stage` (option ID or label). Fields of type `SINGLE_SELECT` or
     * `MULTI_SELECT` accept either an option ID or label from the field's
     * `typeConfiguration.options` — call the
     * <u>[definitions endpoint](/api/resources/opportunity/methods/definitions)</u> to
     * discover available fields and options. See
     * <u>[Fields and relationships](/using-the-api/fields-and-relationships/)</u> for
     * value type details.
     */
    fields: {
        [key: string]: string | number | boolean | Array<string> | OpportunityCreateParams.Address | OpportunityCreateParams.FullName | null;
    };
    /**
     * Relationships to set on the new opportunity. System relationships use a `$`
     * prefix (e.g. `$account`, `$owner`); custom relationships use their bare slug.
     * `$account` is required. Each value is a single entity ID or an array of IDs.
     * Call the
     * <u>[definitions endpoint](/api/resources/opportunity/methods/definitions)</u> to
     * list available relationship keys.
     */
    relationships: {
        [key: string]: string | Array<string>;
    };
}
export declare namespace OpportunityCreateParams {
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
export interface OpportunityUpdateParams {
    /**
     * Field values to update — only provided fields are modified; omitted fields are
     * left unchanged. System fields use a `$` prefix (e.g. `$name`, `$stage`); custom
     * attributes use their bare slug. `SINGLE_SELECT` and `MULTI_SELECT` fields accept
     * an option ID or label — call the
     * <u>[definitions endpoint](/api/resources/opportunity/methods/definitions)</u>
     * for available options. See
     * <u>[Fields and relationships](/using-the-api/fields-and-relationships/)</u> for
     * value type details.
     */
    fields?: {
        [key: string]: string | number | boolean | Array<string> | OpportunityUpdateParams.Address | OpportunityUpdateParams.FullName | null;
    };
    /**
     * Relationship operations to apply. System relationships use a `$` prefix (e.g.
     * `$owner`, `$champion`). Each value is an operation object with `add`, `remove`,
     * or `replace`.
     */
    relationships?: {
        [key: string]: OpportunityUpdateParams.Relationships;
    };
}
export declare namespace OpportunityUpdateParams {
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
export interface OpportunityListParams {
    /**
     * Maximum number of records to return. Defaults to 25, maximum 25.
     */
    limit?: number;
    /**
     * Number of records to skip for pagination. Defaults to 0.
     */
    offset?: number;
}
export declare namespace Opportunity {
    export { type OpportunityCreateResponse as OpportunityCreateResponse, type OpportunityDefinitionsResponse as OpportunityDefinitionsResponse, type OpportunityListResponse as OpportunityListResponse, type OpportunityRetrieveResponse as OpportunityRetrieveResponse, type OpportunityUpdateResponse as OpportunityUpdateResponse, type OpportunityCreateParams as OpportunityCreateParams, type OpportunityUpdateParams as OpportunityUpdateParams, type OpportunityListParams as OpportunityListParams, };
}
//# sourceMappingURL=opportunity.d.mts.map