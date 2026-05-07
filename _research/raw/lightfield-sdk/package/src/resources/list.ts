// File generated from our OpenAPI spec by Stainless. See CONTRIBUTING.md for details.

import { APIResource } from '../core/resource';
import { APIPromise } from '../core/api-promise';
import { RequestOptions } from '../internal/request-options';
import { path } from '../internal/utils/path';

/**
 * Lists are curated collections of accounts, contacts, or opportunities in Lightfield. Each list contains entities of a single type.
 */
export class List extends APIResource {
  /**
   * Creates a new list. The `$name` and `$objectType` fields are required.
   *
   * Supports idempotency via the `Idempotency-Key` header.
   *
   * **[Required scope](/using-the-api/scopes/):** `lists:create`
   *
   * **[Rate limit category](/using-the-api/rate-limits/):** Write
   */
  create(body: ListCreateParams, options?: RequestOptions): APIPromise<ListCreateResponse> {
    return this._client.post('/v1/lists', { body, ...options });
  }

  /**
   * Retrieves a single list by its ID.
   *
   * **[Required scope](/using-the-api/scopes/):** `lists:read`
   *
   * **[Rate limit category](/using-the-api/rate-limits/):** Read
   */
  retrieve(id: string, options?: RequestOptions): APIPromise<ListRetrieveResponse> {
    return this._client.get(path`/v1/lists/${id}`, options);
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
  update(id: string, body: ListUpdateParams, options?: RequestOptions): APIPromise<ListUpdateResponse> {
    return this._client.post(path`/v1/lists/${id}`, { body, ...options });
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
  list(
    query: ListListParams | null | undefined = {},
    options?: RequestOptions,
  ): APIPromise<ListListResponse> {
    return this._client.get('/v1/lists', { query, ...options });
  }

  /**
   * Returns a paginated list of accounts that belong to the specified list.
   *
   * **[Required scopes](/using-the-api/scopes/):** `lists:read` and `accounts:read`
   *
   * **[Rate limit category](/using-the-api/rate-limits/):** Search
   */
  listAccounts(
    listID: string,
    query: ListListAccountsParams | null | undefined = {},
    options?: RequestOptions,
  ): APIPromise<ListListAccountsResponse> {
    return this._client.get(path`/v1/lists/${listID}/accounts`, { query, ...options });
  }

  /**
   * Returns a paginated list of contacts that belong to the specified list.
   *
   * **[Required scopes](/using-the-api/scopes/):** `lists:read` and `contacts:read`
   *
   * **[Rate limit category](/using-the-api/rate-limits/):** Search
   */
  listContacts(
    listID: string,
    query: ListListContactsParams | null | undefined = {},
    options?: RequestOptions,
  ): APIPromise<ListListContactsResponse> {
    return this._client.get(path`/v1/lists/${listID}/contacts`, { query, ...options });
  }

  /**
   * Returns a paginated list of opportunities that belong to the specified list.
   *
   * **[Required scopes](/using-the-api/scopes/):** `lists:read` and
   * `opportunities:read`
   *
   * **[Rate limit category](/using-the-api/rate-limits/):** Search
   */
  listOpportunities(
    listID: string,
    query: ListListOpportunitiesParams | null | undefined = {},
    options?: RequestOptions,
  ): APIPromise<ListListOpportunitiesResponse> {
    return this._client.get(path`/v1/lists/${listID}/opportunities`, { query, ...options });
  }
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
  fields: { [key: string]: ListCreateResponse.Fields };

  /**
   * URL to view the list in the Lightfield web app, or null.
   */
  httpLink: string | null;
}

export namespace ListCreateResponse {
  export interface Fields {
    /**
     * The field value, or null if unset.
     */
    value: string | number | boolean | Array<string> | Fields.Address | Fields.FullName | null;

    /**
     * The data type of the field.
     */
    valueType:
      | 'ADDRESS'
      | 'CHECKBOX'
      | 'CURRENCY'
      | 'DATETIME'
      | 'EMAIL'
      | 'FULL_NAME'
      | 'MARKDOWN'
      | 'MULTI_SELECT'
      | 'NUMBER'
      | 'SINGLE_SELECT'
      | 'SOCIAL_HANDLE'
      | 'TELEPHONE'
      | 'TEXT'
      | 'URL';
  }

  export namespace Fields {
    export interface Address {
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

    export interface FullName {
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

export namespace ListListAccountsResponse {
  export interface Data {
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
    fields: { [key: string]: Data.Fields };

    /**
     * URL to view the entity in the Lightfield web app, or null.
     */
    httpLink: string | null;

    /**
     * Map of relationship names to their associated entities. System relationships are
     * prefixed with `$` (e.g. `$owner`, `$contact`).
     */
    relationships: { [key: string]: Data.Relationships };

    /**
     * ISO 8601 timestamp of when the entity was last updated, or null.
     */
    updatedAt: string | null;

    /**
     * External identifier for the entity, or null if unset.
     */
    externalId?: string | null;
  }

  export namespace Data {
    export interface Fields {
      /**
       * The field value, or null if unset.
       */
      value: string | number | boolean | Array<string> | Fields.Address | Fields.FullName | null;

      /**
       * The data type of the field.
       */
      valueType:
        | 'ADDRESS'
        | 'CHECKBOX'
        | 'CURRENCY'
        | 'DATETIME'
        | 'EMAIL'
        | 'FULL_NAME'
        | 'MARKDOWN'
        | 'MULTI_SELECT'
        | 'NUMBER'
        | 'SINGLE_SELECT'
        | 'SOCIAL_HANDLE'
        | 'TELEPHONE'
        | 'TEXT'
        | 'URL';
    }

    export namespace Fields {
      export interface Address {
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

      export interface FullName {
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

    export interface Relationships {
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

export namespace ListListContactsResponse {
  export interface Data {
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
    fields: { [key: string]: Data.Fields };

    /**
     * URL to view the entity in the Lightfield web app, or null.
     */
    httpLink: string | null;

    /**
     * Map of relationship names to their associated entities. System relationships are
     * prefixed with `$` (e.g. `$owner`, `$contact`).
     */
    relationships: { [key: string]: Data.Relationships };

    /**
     * ISO 8601 timestamp of when the entity was last updated, or null.
     */
    updatedAt: string | null;

    /**
     * External identifier for the entity, or null if unset.
     */
    externalId?: string | null;
  }

  export namespace Data {
    export interface Fields {
      /**
       * The field value, or null if unset.
       */
      value: string | number | boolean | Array<string> | Fields.Address | Fields.FullName | null;

      /**
       * The data type of the field.
       */
      valueType:
        | 'ADDRESS'
        | 'CHECKBOX'
        | 'CURRENCY'
        | 'DATETIME'
        | 'EMAIL'
        | 'FULL_NAME'
        | 'MARKDOWN'
        | 'MULTI_SELECT'
        | 'NUMBER'
        | 'SINGLE_SELECT'
        | 'SOCIAL_HANDLE'
        | 'TELEPHONE'
        | 'TEXT'
        | 'URL';
    }

    export namespace Fields {
      export interface Address {
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

      export interface FullName {
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

    export interface Relationships {
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

export namespace ListListOpportunitiesResponse {
  export interface Data {
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
    fields: { [key: string]: Data.Fields };

    /**
     * URL to view the entity in the Lightfield web app, or null.
     */
    httpLink: string | null;

    /**
     * Map of relationship names to their associated entities. System relationships are
     * prefixed with `$` (e.g. `$owner`, `$contact`).
     */
    relationships: { [key: string]: Data.Relationships };

    /**
     * ISO 8601 timestamp of when the entity was last updated, or null.
     */
    updatedAt: string | null;

    /**
     * External identifier for the entity, or null if unset.
     */
    externalId?: string | null;
  }

  export namespace Data {
    export interface Fields {
      /**
       * The field value, or null if unset.
       */
      value: string | number | boolean | Array<string> | Fields.Address | Fields.FullName | null;

      /**
       * The data type of the field.
       */
      valueType:
        | 'ADDRESS'
        | 'CHECKBOX'
        | 'CURRENCY'
        | 'DATETIME'
        | 'EMAIL'
        | 'FULL_NAME'
        | 'MARKDOWN'
        | 'MULTI_SELECT'
        | 'NUMBER'
        | 'SINGLE_SELECT'
        | 'SOCIAL_HANDLE'
        | 'TELEPHONE'
        | 'TEXT'
        | 'URL';
    }

    export namespace Fields {
      export interface Address {
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

      export interface FullName {
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

    export interface Relationships {
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

export namespace ListListResponse {
  export interface Data {
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
    fields: { [key: string]: Data.Fields };

    /**
     * URL to view the list in the Lightfield web app, or null.
     */
    httpLink: string | null;
  }

  export namespace Data {
    export interface Fields {
      /**
       * The field value, or null if unset.
       */
      value: string | number | boolean | Array<string> | Fields.Address | Fields.FullName | null;

      /**
       * The data type of the field.
       */
      valueType:
        | 'ADDRESS'
        | 'CHECKBOX'
        | 'CURRENCY'
        | 'DATETIME'
        | 'EMAIL'
        | 'FULL_NAME'
        | 'MARKDOWN'
        | 'MULTI_SELECT'
        | 'NUMBER'
        | 'SINGLE_SELECT'
        | 'SOCIAL_HANDLE'
        | 'TELEPHONE'
        | 'TEXT'
        | 'URL';
    }

    export namespace Fields {
      export interface Address {
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

      export interface FullName {
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
  fields: { [key: string]: ListRetrieveResponse.Fields };

  /**
   * URL to view the list in the Lightfield web app, or null.
   */
  httpLink: string | null;
}

export namespace ListRetrieveResponse {
  export interface Fields {
    /**
     * The field value, or null if unset.
     */
    value: string | number | boolean | Array<string> | Fields.Address | Fields.FullName | null;

    /**
     * The data type of the field.
     */
    valueType:
      | 'ADDRESS'
      | 'CHECKBOX'
      | 'CURRENCY'
      | 'DATETIME'
      | 'EMAIL'
      | 'FULL_NAME'
      | 'MARKDOWN'
      | 'MULTI_SELECT'
      | 'NUMBER'
      | 'SINGLE_SELECT'
      | 'SOCIAL_HANDLE'
      | 'TELEPHONE'
      | 'TEXT'
      | 'URL';
  }

  export namespace Fields {
    export interface Address {
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

    export interface FullName {
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
  fields: { [key: string]: ListUpdateResponse.Fields };

  /**
   * URL to view the list in the Lightfield web app, or null.
   */
  httpLink: string | null;
}

export namespace ListUpdateResponse {
  export interface Fields {
    /**
     * The field value, or null if unset.
     */
    value: string | number | boolean | Array<string> | Fields.Address | Fields.FullName | null;

    /**
     * The data type of the field.
     */
    valueType:
      | 'ADDRESS'
      | 'CHECKBOX'
      | 'CURRENCY'
      | 'DATETIME'
      | 'EMAIL'
      | 'FULL_NAME'
      | 'MARKDOWN'
      | 'MULTI_SELECT'
      | 'NUMBER'
      | 'SINGLE_SELECT'
      | 'SOCIAL_HANDLE'
      | 'TELEPHONE'
      | 'TEXT'
      | 'URL';
  }

  export namespace Fields {
    export interface Address {
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

    export interface FullName {
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

export namespace ListCreateParams {
  /**
   * Field values for the new list. Required: `$name` (string) and `$objectType`.
   */
  export interface Fields {
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

  export interface Accounts {
    /**
     * Account ID(s) to add as initial members. List `$objectType` must be `account`.
     */
    $accounts: string | Array<string>;
  }

  export interface Contacts {
    /**
     * Contact ID(s) to add as initial members. List `$objectType` must be `contact`.
     */
    $contacts: string | Array<string>;
  }

  export interface Opportunities {
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

export namespace ListUpdateParams {
  /**
   * Field values to update — only provided fields are modified; omitted fields are
   * left unchanged.
   */
  export interface Fields {
    /**
     * Display name of the list.
     */
    $name?: string;
  }

  export interface Accounts {
    /**
     * Add/remove accounts. List `$objectType` must be `account`.
     */
    $accounts: Accounts.Accounts;
  }

  export namespace Accounts {
    /**
     * Add/remove accounts. List `$objectType` must be `account`.
     */
    export interface Accounts {
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

  export interface Contacts {
    /**
     * Add/remove contacts. List `$objectType` must be `contact`.
     */
    $contacts: Contacts.Contacts;
  }

  export namespace Contacts {
    /**
     * Add/remove contacts. List `$objectType` must be `contact`.
     */
    export interface Contacts {
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

  export interface Opportunities {
    /**
     * Add/remove opportunities. List `$objectType` must be `opportunity`.
     */
    $opportunities: Opportunities.Opportunities;
  }

  export namespace Opportunities {
    /**
     * Add/remove opportunities. List `$objectType` must be `opportunity`.
     */
    export interface Opportunities {
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
  export {
    type ListCreateResponse as ListCreateResponse,
    type ListListAccountsResponse as ListListAccountsResponse,
    type ListListContactsResponse as ListListContactsResponse,
    type ListListOpportunitiesResponse as ListListOpportunitiesResponse,
    type ListListResponse as ListListResponse,
    type ListRetrieveResponse as ListRetrieveResponse,
    type ListUpdateResponse as ListUpdateResponse,
    type ListCreateParams as ListCreateParams,
    type ListUpdateParams as ListUpdateParams,
    type ListListParams as ListListParams,
    type ListListAccountsParams as ListListAccountsParams,
    type ListListContactsParams as ListListContactsParams,
    type ListListOpportunitiesParams as ListListOpportunitiesParams,
  };
}
