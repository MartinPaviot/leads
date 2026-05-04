// File generated from our OpenAPI spec by Stainless. See CONTRIBUTING.md for details.

import { APIResource } from '../core/resource';
import { APIPromise } from '../core/api-promise';
import { RequestOptions } from '../internal/request-options';
import { path } from '../internal/utils/path';

/**
 * Tasks represent action items in Lightfield. Each task belongs to an account, is assigned to a member, and can optionally be associated with an opportunity.
 */
export class Task extends APIResource {
  /**
   * Creates a new task record. The `$title` and `$status` fields and the
   * `$assignedTo` relationship are required.
   *
   * If `$createdBy` is omitted it defaults to the authenticated user. The `$note`
   * relationship is read-only — manage notes via their own relationships.
   *
   * Supports idempotency via the `Idempotency-Key` header.
   *
   * **[Required scope](/using-the-api/scopes/):** `tasks:create`
   *
   * **[Rate limit category](/using-the-api/rate-limits/):** Write
   */
  create(body: TaskCreateParams, options?: RequestOptions): APIPromise<TaskCreateResponse> {
    return this._client.post('/v1/tasks', { body, ...options });
  }

  /**
   * Retrieves a single task by its ID.
   *
   * **[Required scope](/using-the-api/scopes/):** `tasks:read`
   *
   * **[Rate limit category](/using-the-api/rate-limits/):** Read
   */
  retrieve(id: string, options?: RequestOptions): APIPromise<TaskRetrieveResponse> {
    return this._client.get(path`/v1/tasks/${id}`, options);
  }

  /**
   * Updates an existing task by ID. Only included fields and relationships are
   * modified.
   *
   * The `$note` relationship is read-only — manage notes via their own
   * relationships.
   *
   * Supports idempotency via the `Idempotency-Key` header.
   *
   * **[Required scope](/using-the-api/scopes/):** `tasks:update`
   *
   * **[Rate limit category](/using-the-api/rate-limits/):** Write
   */
  update(id: string, body: TaskUpdateParams, options?: RequestOptions): APIPromise<TaskUpdateResponse> {
    return this._client.post(path`/v1/tasks/${id}`, { body, ...options });
  }

  /**
   * Returns a paginated list of tasks. Use `offset` and `limit` to paginate through
   * results. See <u>[List endpoints](/using-the-api/list-endpoints/)</u> for more
   * information about pagination.
   *
   * **[Required scope](/using-the-api/scopes/):** `tasks:read`
   *
   * **[Rate limit category](/using-the-api/rate-limits/):** Search
   */
  list(
    query: TaskListParams | null | undefined = {},
    options?: RequestOptions,
  ): APIPromise<TaskListResponse> {
    return this._client.get('/v1/tasks', { query, ...options });
  }

  /**
   * Returns the schema for the field and relationship definitions available on
   * tasks. Useful for understanding the shape of task data before creating or
   * updating records. See
   * <u>[Fields and relationships](/using-the-api/fields-and-relationships/)</u> for
   * more details.
   *
   * **[Required scope](/using-the-api/scopes/):** `tasks:read`
   *
   * **[Rate limit category](/using-the-api/rate-limits/):** Read
   */
  definitions(options?: RequestOptions): APIPromise<TaskDefinitionsResponse> {
    return this._client.get('/v1/tasks/definitions', options);
  }
}

export interface TaskCreateResponse {
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
  fields: { [key: string]: TaskCreateResponse.Fields };

  /**
   * URL to view the entity in the Lightfield web app, or null.
   */
  httpLink: string | null;

  /**
   * Map of relationship names to their associated entities. System relationships are
   * prefixed with `$` (e.g. `$owner`, `$contact`).
   */
  relationships: { [key: string]: TaskCreateResponse.Relationships };

  /**
   * ISO 8601 timestamp of when the entity was last updated, or null.
   */
  updatedAt: string | null;

  /**
   * External identifier for the entity, or null if unset.
   */
  externalId?: string | null;
}

export namespace TaskCreateResponse {
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

export interface TaskDefinitionsResponse {
  /**
   * Map of field keys to their definitions, including both system and custom fields.
   */
  fieldDefinitions: { [key: string]: TaskDefinitionsResponse.FieldDefinitions };

  /**
   * The object type these definitions belong to (e.g. `account`).
   */
  objectType: string;

  /**
   * Map of relationship keys to their definitions.
   */
  relationshipDefinitions: { [key: string]: TaskDefinitionsResponse.RelationshipDefinitions };
}

export namespace TaskDefinitionsResponse {
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

export interface TaskListResponse {
  /**
   * Array of entity objects for the current page.
   */
  data: Array<TaskListResponse.Data>;

  /**
   * The object type, always `"list"`.
   */
  object: string;

  /**
   * Total number of entities matching the query.
   */
  totalCount: number;
}

export namespace TaskListResponse {
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

export interface TaskRetrieveResponse {
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
  fields: { [key: string]: TaskRetrieveResponse.Fields };

  /**
   * URL to view the entity in the Lightfield web app, or null.
   */
  httpLink: string | null;

  /**
   * Map of relationship names to their associated entities. System relationships are
   * prefixed with `$` (e.g. `$owner`, `$contact`).
   */
  relationships: { [key: string]: TaskRetrieveResponse.Relationships };

  /**
   * ISO 8601 timestamp of when the entity was last updated, or null.
   */
  updatedAt: string | null;

  /**
   * External identifier for the entity, or null if unset.
   */
  externalId?: string | null;
}

export namespace TaskRetrieveResponse {
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

export interface TaskUpdateResponse {
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
  fields: { [key: string]: TaskUpdateResponse.Fields };

  /**
   * URL to view the entity in the Lightfield web app, or null.
   */
  httpLink: string | null;

  /**
   * Map of relationship names to their associated entities. System relationships are
   * prefixed with `$` (e.g. `$owner`, `$contact`).
   */
  relationships: { [key: string]: TaskUpdateResponse.Relationships };

  /**
   * ISO 8601 timestamp of when the entity was last updated, or null.
   */
  updatedAt: string | null;

  /**
   * External identifier for the entity, or null if unset.
   */
  externalId?: string | null;
}

export namespace TaskUpdateResponse {
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

export interface TaskCreateParams {
  /**
   * Field values for the new task. Tasks only support the documented system fields,
   * all prefixed with `$` (e.g. `$title`, `$status`). Required: `$title` (string)
   * and `$status` (one of `TODO`, `IN_PROGRESS`, `COMPLETE`, `CANCELLED`). Call the
   * <u>[definitions endpoint](/api/resources/task/methods/definitions)</u> to
   * discover the available fields. See
   * <u>[Fields and relationships](/using-the-api/fields-and-relationships/)</u> for
   * value type details.
   */
  fields: TaskCreateParams.Fields;

  /**
   * Relationships to set on the new task. System relationships use a `$` prefix
   * (e.g. `$account`, `$assignedTo`); custom relationships use their bare slug.
   * `$assignedTo` is required. Each value is a single entity ID or an array of IDs.
   * Call the <u>[definitions endpoint](/api/resources/task/methods/definitions)</u>
   * to list available relationship keys.
   */
  relationships: { [key: string]: string | Array<string> };
}

export namespace TaskCreateParams {
  /**
   * Field values for the new task. Tasks only support the documented system fields,
   * all prefixed with `$` (e.g. `$title`, `$status`). Required: `$title` (string)
   * and `$status` (one of `TODO`, `IN_PROGRESS`, `COMPLETE`, `CANCELLED`). Call the
   * <u>[definitions endpoint](/api/resources/task/methods/definitions)</u> to
   * discover the available fields. See
   * <u>[Fields and relationships](/using-the-api/fields-and-relationships/)</u> for
   * value type details.
   */
  export interface Fields {
    /**
     * Task status. One of: `TODO`, `IN_PROGRESS`, `COMPLETE`, `CANCELLED`.
     */
    $status: string;

    /**
     * Title of the task.
     */
    $title: string;

    /**
     * Description of the task in markdown format.
     */
    $description?: string | null;

    /**
     * Due date as an ISO 8601 datetime string.
     */
    $dueAt?: string | null;
  }
}

export interface TaskUpdateParams {
  /**
   * Field values to update — only provided fields are modified; omitted fields are
   * left unchanged. Tasks only support the documented system fields, all prefixed
   * with `$` (e.g. `$title`, `$status`). Call the
   * <u>[definitions endpoint](/api/resources/task/methods/definitions)</u> for
   * available fields. See
   * <u>[Fields and relationships](/using-the-api/fields-and-relationships/)</u> for
   * value type details.
   */
  fields?: TaskUpdateParams.Fields;

  /**
   * Relationship operations to apply. System relationships use a `$` prefix (e.g.
   * `$account`, `$assignedTo`). Each value is an operation object with `add`,
   * `remove`, or `replace`.
   */
  relationships?: { [key: string]: TaskUpdateParams.Relationships };
}

export namespace TaskUpdateParams {
  /**
   * Field values to update — only provided fields are modified; omitted fields are
   * left unchanged. Tasks only support the documented system fields, all prefixed
   * with `$` (e.g. `$title`, `$status`). Call the
   * <u>[definitions endpoint](/api/resources/task/methods/definitions)</u> for
   * available fields. See
   * <u>[Fields and relationships](/using-the-api/fields-and-relationships/)</u> for
   * value type details.
   */
  export interface Fields {
    /**
     * Description of the task in markdown format.
     */
    $description?: string | null;

    /**
     * Due date as an ISO 8601 datetime string.
     */
    $dueAt?: string | null;

    /**
     * Task status. One of: `TODO`, `IN_PROGRESS`, `COMPLETE`, `CANCELLED`.
     */
    $status?: string | null;

    /**
     * Title of the task.
     */
    $title?: string | null;
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

export interface TaskListParams {
  /**
   * Maximum number of records to return. Defaults to 25, maximum 25.
   */
  limit?: number;

  /**
   * Number of records to skip for pagination. Defaults to 0.
   */
  offset?: number;
}

export declare namespace Task {
  export {
    type TaskCreateResponse as TaskCreateResponse,
    type TaskDefinitionsResponse as TaskDefinitionsResponse,
    type TaskListResponse as TaskListResponse,
    type TaskRetrieveResponse as TaskRetrieveResponse,
    type TaskUpdateResponse as TaskUpdateResponse,
    type TaskCreateParams as TaskCreateParams,
    type TaskUpdateParams as TaskUpdateParams,
    type TaskListParams as TaskListParams,
  };
}
