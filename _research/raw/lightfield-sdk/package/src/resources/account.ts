// File generated from our OpenAPI spec by Stainless. See CONTRIBUTING.md for details.

import { APIResource } from '../core/resource';
import { APIPromise } from '../core/api-promise';
import { RequestOptions } from '../internal/request-options';
import { path } from '../internal/utils/path';

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
  create(body: AccountCreateParams, options?: RequestOptions): APIPromise<AccountCreateResponse> {
    return this._client.post('/v1/accounts', { body, ...options });
  }

  /**
   * Retrieves a single account by its ID.
   *
   * **[Required scope](/using-the-api/scopes/):** `accounts:read`
   *
   * **[Rate limit category](/using-the-api/rate-limits/):** Read
   */
  retrieve(id: string, options?: RequestOptions): APIPromise<AccountRetrieveResponse> {
    return this._client.get(path`/v1/accounts/${id}`, options);
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
  update(id: string, body: AccountUpdateParams, options?: RequestOptions): APIPromise<AccountUpdateResponse> {
    return this._client.post(path`/v1/accounts/${id}`, { body, ...options });
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
  list(
    query: AccountListParams | null | undefined = {},
    options?: RequestOptions,
  ): APIPromise<AccountListResponse> {
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
  definitions(options?: RequestOptions): APIPromise<AccountDefinitionsResponse> {
    return this._client.get('/v1/accounts/definitions', options);
  }
}

export interface AccountCreateResponse {
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
  fields: { [key: string]: AccountCreateResponse.Fields };

  /**
   * URL to view the entity in the Lightfield web app, or null.
   */
  httpLink: string | null;

  /**
   * Map of relationship names to their associated entities. System relationships are
   * prefixed with `$` (e.g. `$owner`, `$contact`).
   */
  relationships: { [key: string]: AccountCreateResponse.Relationships };

  /**
   * ISO 8601 timestamp of when the entity was last updated, or null.
   */
  updatedAt: string | null;

  /**
   * External identifier for the entity, or null if unset.
   */
  externalId?: string | null;
}

export namespace AccountCreateResponse {
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

export interface AccountDefinitionsResponse {
  /**
   * Map of field keys to their definitions, including both system and custom fields.
   */
  fieldDefinitions: { [key: string]: AccountDefinitionsResponse.FieldDefinitions };

  /**
   * The object type these definitions belong to (e.g. `account`).
   */
  objectType: string;

  /**
   * Map of relationship keys to their definitions.
   */
  relationshipDefinitions: { [key: string]: AccountDefinitionsResponse.RelationshipDefinitions };
}

export namespace AccountDefinitionsResponse {
  export interface FieldDefinitions {
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

  export namespace FieldDefinitions {
    /**
     * Type-specific configuration (e.g. select options, currency code).
     */
    export interface TypeConfiguration {
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

    export namespace TypeConfiguration {
      export interface Option {
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

  export interface RelationshipDefinitions {
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

export interface AccountListResponse {
  /**
   * Array of entity objects for the current page.
   */
  data: Array<AccountListResponse.Data>;

  /**
   * The object type, always `"list"`.
   */
  object: string;

  /**
   * Total number of entities matching the query.
   */
  totalCount: number;
}

export namespace AccountListResponse {
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

export interface AccountRetrieveResponse {
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
  fields: { [key: string]: AccountRetrieveResponse.Fields };

  /**
   * URL to view the entity in the Lightfield web app, or null.
   */
  httpLink: string | null;

  /**
   * Map of relationship names to their associated entities. System relationships are
   * prefixed with `$` (e.g. `$owner`, `$contact`).
   */
  relationships: { [key: string]: AccountRetrieveResponse.Relationships };

  /**
   * ISO 8601 timestamp of when the entity was last updated, or null.
   */
  updatedAt: string | null;

  /**
   * External identifier for the entity, or null if unset.
   */
  externalId?: string | null;
}

export namespace AccountRetrieveResponse {
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

export interface AccountUpdateResponse {
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
  fields: { [key: string]: AccountUpdateResponse.Fields };

  /**
   * URL to view the entity in the Lightfield web app, or null.
   */
  httpLink: string | null;

  /**
   * Map of relationship names to their associated entities. System relationships are
   * prefixed with `$` (e.g. `$owner`, `$contact`).
   */
  relationships: { [key: string]: AccountUpdateResponse.Relationships };

  /**
   * ISO 8601 timestamp of when the entity was last updated, or null.
   */
  updatedAt: string | null;

  /**
   * External identifier for the entity, or null if unset.
   */
  externalId?: string | null;
}

export namespace AccountUpdateResponse {
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

export interface AccountCreateParams {
  /**
   * Field values for the new account. System fields use a `$` prefix (e.g. `$name`,
   * `$website`); custom attributes use their bare slug (e.g. `tier`, `renewalDate`).
   * Required: `$name` (string). Fields of type `SINGLE_SELECT` or `MULTI_SELECT`
   * accept either an option ID or label from the field's `typeConfiguration.options`
   * — call the
   * <u>[definitions endpoint](/api/resources/account/methods/definitions)</u> to
   * discover available fields and options. See
   * <u>[Fields and relationships](/using-the-api/fields-and-relationships/)</u> for
   * value type details.
   */
  fields: {
    [key: string]:
      | string
      | number
      | boolean
      | Array<string>
      | AccountCreateParams.Address
      | AccountCreateParams.FullName
      | null;
  };

  /**
   * Relationships to set on the new account. System relationships use a `$` prefix
   * (e.g. `$owner`, `$contact`); custom relationships use their bare slug. Each
   * value is a single entity ID or an array of IDs. Call the
   * <u>[definitions endpoint](/api/resources/account/methods/definitions)</u> to
   * list available relationship keys.
   */
  relationships?: { [key: string]: string | Array<string> };
}

export namespace AccountCreateParams {
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

export interface AccountUpdateParams {
  /**
   * Field values to update — only provided fields are modified; omitted fields are
   * left unchanged. System fields use a `$` prefix (e.g. `$name`); custom attributes
   * use their bare slug. `SINGLE_SELECT` and `MULTI_SELECT` fields accept an option
   * ID or label — call the
   * <u>[definitions endpoint](/api/resources/account/methods/definitions)</u> for
   * available options. See
   * <u>[Fields and relationships](/using-the-api/fields-and-relationships/)</u> for
   * value type details.
   */
  fields?: {
    [key: string]:
      | string
      | number
      | boolean
      | Array<string>
      | AccountUpdateParams.Address
      | AccountUpdateParams.FullName
      | null;
  };

  /**
   * Relationship operations to apply. System relationships use a `$` prefix (e.g.
   * `$owner`, `$contact`). Each value is an operation object with `add`, `remove`,
   * or `replace`.
   */
  relationships?: { [key: string]: AccountUpdateParams.Relationships };
}

export namespace AccountUpdateParams {
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

  /**
   * An operation to modify a relationship. Provide one of `add`, `remove`, or
   * `replace`.
   */
  export interface Relationships {
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

export interface AccountListParams {
  /**
   * Maximum number of records to return. Defaults to 25, maximum 25.
   */
  limit?: number;

  /**
   * Number of records to skip for pagination. Defaults to 0.
   */
  offset?: number;
}

export declare namespace Account {
  export {
    type AccountCreateResponse as AccountCreateResponse,
    type AccountDefinitionsResponse as AccountDefinitionsResponse,
    type AccountListResponse as AccountListResponse,
    type AccountRetrieveResponse as AccountRetrieveResponse,
    type AccountUpdateResponse as AccountUpdateResponse,
    type AccountCreateParams as AccountCreateParams,
    type AccountUpdateParams as AccountUpdateParams,
    type AccountListParams as AccountListParams,
  };
}
