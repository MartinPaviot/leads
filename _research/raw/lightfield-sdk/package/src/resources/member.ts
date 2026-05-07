// File generated from our OpenAPI spec by Stainless. See CONTRIBUTING.md for details.

import { APIResource } from '../core/resource';
import { APIPromise } from '../core/api-promise';
import { RequestOptions } from '../internal/request-options';
import { path } from '../internal/utils/path';

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
  retrieve(id: string, options?: RequestOptions): APIPromise<MemberRetrieveResponse> {
    return this._client.get(path`/v1/members/${id}`, options);
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
  list(
    query: MemberListParams | null | undefined = {},
    options?: RequestOptions,
  ): APIPromise<MemberListResponse> {
    return this._client.get('/v1/members', { query, ...options });
  }
}

export interface MemberListResponse {
  /**
   * Array of member objects for the current page.
   */
  data: Array<MemberListResponse.Data>;

  /**
   * The object type, always `"list"`.
   */
  object: string;

  /**
   * Total number of members in the workspace.
   */
  totalCount: number;
}

export namespace MemberListResponse {
  export interface Data {
    /**
     * Unique identifier for the member.
     */
    id: string;

    /**
     * ISO 8601 timestamp of when the member was created.
     */
    createdAt: string;

    /**
     * Map of field names to their typed values.
     */
    fields: Data.Fields;

    /**
     * URL to view the member in the Lightfield web app, or null.
     */
    httpLink: string | null;

    /**
     * Members do not expose writable or readable relationships in this API.
     */
    relationships: unknown;

    /**
     * ISO 8601 timestamp of when the member was last updated, or null.
     */
    updatedAt: string | null;
  }

  export namespace Data {
    /**
     * Map of field names to their typed values.
     */
    export interface Fields {
      /**
       * The member's email address.
       */
      $email: Fields.Email;

      /**
       * The member's full name.
       */
      $name: Fields.Name;

      /**
       * URL of the member's profile image, or null if unset.
       */
      $profileImage: Fields.ProfileImage;

      /**
       * The member's workspace role.
       */
      $role: Fields.Role;
    }

    export namespace Fields {
      /**
       * The member's email address.
       */
      export interface Email {
        /**
         * The field value.
         */
        value: string;

        /**
         * The data type of the field value.
         */
        valueType: 'EMAIL';
      }

      /**
       * The member's full name.
       */
      export interface Name {
        value: Name.Value;

        /**
         * The data type of the field value.
         */
        valueType: 'FULL_NAME';
      }

      export namespace Name {
        export interface Value {
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

      /**
       * URL of the member's profile image, or null if unset.
       */
      export interface ProfileImage {
        /**
         * The field value, or null if unset.
         */
        value: string | null;

        /**
         * The data type of the field value.
         */
        valueType: 'URL';
      }

      /**
       * The member's workspace role.
       */
      export interface Role {
        /**
         * The field value.
         */
        value: string;

        /**
         * The data type of the field value.
         */
        valueType: 'TEXT';
      }
    }
  }
}

export interface MemberRetrieveResponse {
  /**
   * Unique identifier for the member.
   */
  id: string;

  /**
   * ISO 8601 timestamp of when the member was created.
   */
  createdAt: string;

  /**
   * Map of field names to their typed values.
   */
  fields: MemberRetrieveResponse.Fields;

  /**
   * URL to view the member in the Lightfield web app, or null.
   */
  httpLink: string | null;

  /**
   * Members do not expose writable or readable relationships in this API.
   */
  relationships: unknown;

  /**
   * ISO 8601 timestamp of when the member was last updated, or null.
   */
  updatedAt: string | null;
}

export namespace MemberRetrieveResponse {
  /**
   * Map of field names to their typed values.
   */
  export interface Fields {
    /**
     * The member's email address.
     */
    $email: Fields.Email;

    /**
     * The member's full name.
     */
    $name: Fields.Name;

    /**
     * URL of the member's profile image, or null if unset.
     */
    $profileImage: Fields.ProfileImage;

    /**
     * The member's workspace role.
     */
    $role: Fields.Role;
  }

  export namespace Fields {
    /**
     * The member's email address.
     */
    export interface Email {
      /**
       * The field value.
       */
      value: string;

      /**
       * The data type of the field value.
       */
      valueType: 'EMAIL';
    }

    /**
     * The member's full name.
     */
    export interface Name {
      value: Name.Value;

      /**
       * The data type of the field value.
       */
      valueType: 'FULL_NAME';
    }

    export namespace Name {
      export interface Value {
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

    /**
     * URL of the member's profile image, or null if unset.
     */
    export interface ProfileImage {
      /**
       * The field value, or null if unset.
       */
      value: string | null;

      /**
       * The data type of the field value.
       */
      valueType: 'URL';
    }

    /**
     * The member's workspace role.
     */
    export interface Role {
      /**
       * The field value.
       */
      value: string;

      /**
       * The data type of the field value.
       */
      valueType: 'TEXT';
    }
  }
}

export interface MemberListParams {
  /**
   * Maximum number of records to return. Defaults to 25, maximum 25.
   */
  limit?: number;

  /**
   * Number of records to skip for pagination. Defaults to 0.
   */
  offset?: number;
}

export declare namespace Member {
  export {
    type MemberListResponse as MemberListResponse,
    type MemberRetrieveResponse as MemberRetrieveResponse,
    type MemberListParams as MemberListParams,
  };
}
