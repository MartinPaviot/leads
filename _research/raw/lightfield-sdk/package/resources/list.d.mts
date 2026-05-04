import { APIResource } from "../core/resource.mjs";
import { APIPromise } from "../core/api-promise.mjs";
import { RequestOptions } from "../internal/request-options.mjs";
/**
 * Lists are curated collections of accounts, contacts, or opportunities in Lightfield. Each list contains entities of a single type.
 */
export declare class List extends APIResource {
    /**
     * Creates a new list. The `$name` and `$objectType` fields are required.
     *
     * Supports idempotency via the `Idempotency-Key` header.
     *
     * **[Required scope](/using-the-api/scopes/):** `lists:create`
     *
     * **[Rate limit category](/using-the-api/rate-limits/):** Write
     */
    create(body: ListCreateParams, options?: RequestOptions): APIPromise<ListCreateResponse>;
    /**
     * Retrieves a single list by its ID.
     *
     * **[Required scope](/using-the-api/scopes/):** `lists:read`
     *
     * **[Rate limit category](/using-the-api/rate-limits/):** Read
     */
    retrieve(id: string, options?: RequestOptions): APIPromise<ListRetrieveResponse>;
    /**
     * Updates an existing list by ID. Only included fields are modified.
     *
     * Supports idempotency via the `Idempotency-Key` header.
     *
     * **[Required scope](/using-the-api/scopes/):** `lists:update`
     *
     * **[Rate limit category](/using-the-api/rate-limits/):** Write
     */
    update(id: string, body: ListUpdateParams, options?: RequestOptions): APIPromise<ListUpdateResponse>;
    /**
     * Returns a paginated list of lists. Use `offset` and `limit` to paginate through
     * results. See <u>[List endpoints](/using-the-api/list-endpoints/)</u> for more
     * information about pagination.
     *
     * **[Required scope](/using-the-api/scopes/):** `lists:read`
     *
     * **[Rate limit category](/using-the-api/rate-limits/):** Search
     */
    list(query?: ListListParams | null | undefined, options?: RequestOptions): APIPromise<ListListResponse>;
    /**
     * Returns a paginated list of accounts that belong to the specified list.
     *
     * **[Required scopes](/using-the-api/scopes/):** `lists:read` and `accounts:read`
     *
     * **[Rate limit category](/using-the-api/rate-limits/):** Search
     */
    listAccounts(listID: string, query?: ListListAccountsParams | null | undefined, options?: RequestOptions): APIPromise<ListListAccountsResponse>;
    /**
     * Returns a paginated list of contacts that belong to the specified list.
     *
     * **[Required scopes](/using-the-api/scopes/):** `lists:read` and `contacts:read`
     *
     * **[Rate limit category](/using-the-api/rate-limits/):** Search
     */
    listContacts(listID: string, query?: ListListContactsParams | null | undefined, options?: RequestOptions): APIPromise<ListListContactsResponse>;
    /**
     * Returns a paginated list of opportunities that belong to the specified list.
     *
     * **[Required scopes](/using-the-api/scopes/):** `lists:read` and
     * `opportunities:read`
     *
     * **[Rate limit category](/using-the-api/rate-limits/):** Search
     */
    listOpportunities(listID: string, query?: ListListOpportunitiesParams | null | undefined, options?: RequestOptions): APIPromise<ListListOpportunitiesResponse>;
}
export interface ListCreateResponse {
    /**
     * Unique identifier for the list.
     */
    id: string;
    /**
     * ISO 8601 timestamp of when the list was created.
     */
    createdAt: string;
    /**
     * Map of field names to their typed values. System fields are prefixed with `$`
     * (e.g. `$name`, `$objectType`).
     */
    fields: {
        [key: string]: ListCreateResponse.Fields;
    };
    /**
     * URL to view the list in the Lightfield web app, or null.
     */
    httpLink: string | null;
}
export declare namespace ListCreateResponse {
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
}
export interface ListListAccountsResponse {
    /**
     * Array of entity objects for the current page.
     */
    data: Array<ListListAccountsResponse.Data>;
    /**
     * The object type, always `"list"`.
     */
    object: string;
    /**
     * Total number of entities matching the query.
     */
    totalCount: number;
}
export declare namespace ListListAccountsResponse {
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
export interface ListListContactsResponse {
    /**
     * Array of entity objects for the current page.
     */
    data: Array<ListListContactsResponse.Data>;
    /**
     * The object type, always `"list"`.
     */
    object: string;
    /**
     * Total number of entities matching the query.
     */
    totalCount: number;
}
export declare namespace ListListContactsResponse {
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
export interface ListListOpportunitiesResponse {
    /**
     * Array of entity objects for the current page.
     */
    data: Array<ListListOpportunitiesResponse.Data>;
    /**
     * The object type, always `"list"`.
     */
    object: string;
    /**
     * Total number of entities matching the query.
     */
    totalCount: number;
}
export declare namespace ListListOpportunitiesResponse {
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
export interface ListListResponse {
    /**
     * Array of list objects for the current page.
     */
    data: Array<ListListResponse.Data>;
    /**
     * The object type, always `"list"`.
     */
    object: string;
    /**
     * Total number of lists matching the query.
     */
    totalCount: number;
}
export declare namespace ListListResponse {
    interface Data {
        /**
         * Unique identifier for the list.
         */
        id: string;
        /**
         * ISO 8601 timestamp of when the list was created.
         */
        createdAt: string;
        /**
         * Map of field names to their typed values. System fields are prefixed with `$`
         * (e.g. `$name`, `$objectType`).
         */
        fields: {
            [key: string]: Data.Fields;
        };
        /**
         * URL to view the list in the Lightfield web app, or null.
         */
        httpLink: string | null;
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
    }
}
export interface ListRetrieveResponse {
    /**
     * Unique identifier for the list.
     */
    id: string;
    /**
     * ISO 8601 timestamp of when the list was created.
     */
    createdAt: string;
    /**
     * Map of field names to their typed values. System fields are prefixed with `$`
     * (e.g. `$name`, `$objectType`).
     */
    fields: {
        [key: string]: ListRetrieveResponse.Fields;
    };
    /**
     * URL to view the list in the Lightfield web app, or null.
     */
    httpLink: string | null;
}
export declare namespace ListRetrieveResponse {
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
}
export interface ListUpdateResponse {
    /**
     * Unique identifier for the list.
     */
    id: string;
    /**
     * ISO 8601 timestamp of when the list was created.
     */
    createdAt: string;
    /**
     * Map of field names to their typed values. System fields are prefixed with `$`
     * (e.g. `$name`, `$objectType`).
     */
    fields: {
        [key: string]: ListUpdateResponse.Fields;
    };
    /**
     * URL to view the list in the Lightfield web app, or null.
     */
    httpLink: string | null;
}
export declare namespace ListUpdateResponse {
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
}
export interface ListCreateParams {
    /**
     * Field values for the new list. Required: `$name` (string) and `$objectType`.
     */
    fields: ListCreateParams.Fields;
    /**
     * Relationships to set on the new list.
     */
    relationships?: ListCreateParams.Accounts | ListCreateParams.Contacts | ListCreateParams.Opportunities;
}
export declare namespace ListCreateParams {
    /**
     * Field values for the new list. Required: `$name` (string) and `$objectType`.
     */
    interface Fields {
        /**
         * Display name of the list.
         */
        $name: string;
        /**
         * The type of entities this list contains. One of `account`, `contact`, or
         * `opportunity`.
         */
        $objectType: 'account' | 'contact' | 'opportunity';
    }
    interface Accounts {
        /**
         * Account ID(s) to add as initial members. List `$objectType` must be `account`.
         */
        $accounts: string | Array<string>;
    }
    interface Contacts {
        /**
         * Contact ID(s) to add as initial members. List `$objectType` must be `contact`.
         */
        $contacts: string | Array<string>;
    }
    interface Opportunities {
        /**
         * Opportunity ID(s) to add as initial members. List `$objectType` must be
         * `opportunity`.
         */
        $opportunities: string | Array<string>;
    }
}
export interface ListUpdateParams {
    /**
     * Field values to update — only provided fields are modified; omitted fields are
     * left unchanged.
     */
    fields?: ListUpdateParams.Fields;
    /**
     * Relationship operations. Use the key matching the list's `$objectType` (e.g.
     * `$accounts` for an account list).
     */
    relationships?: ListUpdateParams.Accounts | ListUpdateParams.Contacts | ListUpdateParams.Opportunities;
}
export declare namespace ListUpdateParams {
    /**
     * Field values to update — only provided fields are modified; omitted fields are
     * left unchanged.
     */
    interface Fields {
        /**
         * Display name of the list.
         */
        $name?: string;
    }
    interface Accounts {
        /**
         * Add/remove accounts. List `$objectType` must be `account`.
         */
        $accounts: Accounts.Accounts;
    }
    namespace Accounts {
        /**
         * Add/remove accounts. List `$objectType` must be `account`.
         */
        interface Accounts {
            /**
             * Entity ID(s) to add to the list.
             */
            add?: string | Array<string>;
            /**
             * Entity ID(s) to remove from the list.
             */
            remove?: string | Array<string>;
        }
    }
    interface Contacts {
        /**
         * Add/remove contacts. List `$objectType` must be `contact`.
         */
        $contacts: Contacts.Contacts;
    }
    namespace Contacts {
        /**
         * Add/remove contacts. List `$objectType` must be `contact`.
         */
        interface Contacts {
            /**
             * Entity ID(s) to add to the list.
             */
            add?: string | Array<string>;
            /**
             * Entity ID(s) to remove from the list.
             */
            remove?: string | Array<string>;
        }
    }
    interface Opportunities {
        /**
         * Add/remove opportunities. List `$objectType` must be `opportunity`.
         */
        $opportunities: Opportunities.Opportunities;
    }
    namespace Opportunities {
        /**
         * Add/remove opportunities. List `$objectType` must be `opportunity`.
         */
        interface Opportunities {
            /**
             * Entity ID(s) to add to the list.
             */
            add?: string | Array<string>;
            /**
             * Entity ID(s) to remove from the list.
             */
            remove?: string | Array<string>;
        }
    }
}
export interface ListListParams {
    /**
     * Maximum number of records to return. Defaults to 25, maximum 25.
     */
    limit?: number;
    /**
     * Number of records to skip for pagination. Defaults to 0.
     */
    offset?: number;
}
export interface ListListAccountsParams {
    /**
     * Maximum number of records to return. Defaults to 25, maximum 25.
     */
    limit?: number;
    /**
     * Number of records to skip for pagination. Defaults to 0.
     */
    offset?: number;
}
export interface ListListContactsParams {
    /**
     * Maximum number of records to return. Defaults to 25, maximum 25.
     */
    limit?: number;
    /**
     * Number of records to skip for pagination. Defaults to 0.
     */
    offset?: number;
}
export interface ListListOpportunitiesParams {
    /**
     * Maximum number of records to return. Defaults to 25, maximum 25.
     */
    limit?: number;
    /**
     * Number of records to skip for pagination. Defaults to 0.
     */
    offset?: number;
}
export declare namespace List {
    export { type ListCreateResponse as ListCreateResponse, type ListListAccountsResponse as ListListAccountsResponse, type ListListContactsResponse as ListListContactsResponse, type ListListOpportunitiesResponse as ListListOpportunitiesResponse, type ListListResponse as ListListResponse, type ListRetrieveResponse as ListRetrieveResponse, type ListUpdateResponse as ListUpdateResponse, type ListCreateParams as ListCreateParams, type ListUpdateParams as ListUpdateParams, type ListListParams as ListListParams, type ListListAccountsParams as ListListAccountsParams, type ListListContactsParams as ListListContactsParams, type ListListOpportunitiesParams as ListListOpportunitiesParams, };
}
//# sourceMappingURL=list.d.mts.map