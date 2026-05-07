import { APIResource } from "../core/resource.js";
import { APIPromise } from "../core/api-promise.js";
import { RequestOptions } from "../internal/request-options.js";
/**
 * Meetings represent synced or manually created interactions in Lightfield. Read responses are privacy-aware and may be redacted based on the caller. For transcript uploads and attachment flows, see <u>[Uploading meeting transcripts](/using-the-api/uploading-meeting-transcripts/)</u>.
 */
export declare class Meeting extends APIResource {
    /**
     * Creates a new meeting record. This endpoint only supports creation of meetings
     * in the past. The `$title`, `$startDate`, and `$endDate` fields are required.
     * Only the `$transcript` relationship is writable on create; all other meeting
     * relationships are system-managed. The response is privacy-aware and includes a
     * read-only `accessLevel`. See
     * <u>[Uploading meeting transcripts](/using-the-api/uploading-meeting-transcripts/)</u>
     * for the full file upload and transcript attachment flow.
     *
     * Supports idempotency via the `Idempotency-Key` header.
     *
     * **[Required scope](/using-the-api/scopes/):** `meetings:create`
     *
     * **[Rate limit category](/using-the-api/rate-limits/):** Write
     */
    create(body: MeetingCreateParams, options?: RequestOptions): APIPromise<MeetingCreateResponse>;
    /**
     * Retrieves a single meeting by its ID. Meeting fields and transcript visibility
     * are redacted based on the caller-specific privacy resolution, and the response
     * includes a read-only `accessLevel`.
     *
     * **[Required scope](/using-the-api/scopes/):** `meetings:read`
     *
     * **[Rate limit category](/using-the-api/rate-limits/):** Read
     */
    retrieve(id: string, options?: RequestOptions): APIPromise<MeetingRetrieveResponse>;
    /**
     * Updates an existing meeting by ID. Only included fields and relationships are
     * modified.
     *
     * Only `fields.$privacySetting` and `relationships.$transcript.replace` are
     * writable. Use `$transcript.replace` to set the meeting transcript. Clearing or
     * removing `$transcript` is not supported. The response is privacy-aware and
     * includes a read-only `accessLevel`. See
     * <u>[Uploading meeting transcripts](/using-the-api/uploading-meeting-transcripts/)</u>
     * for the full file upload and transcript attachment flow.
     *
     * Supports idempotency via the `Idempotency-Key` header.
     *
     * **[Required scope](/using-the-api/scopes/):** `meetings:update`
     *
     * **[Rate limit category](/using-the-api/rate-limits/):** Write
     */
    update(id: string, body: MeetingUpdateParams, options?: RequestOptions): APIPromise<MeetingUpdateResponse>;
    /**
     * Returns a paginated list of meetings. Use `offset` and `limit` to paginate
     * through results. Each meeting is privacy-filtered per caller, includes a
     * read-only `accessLevel`, and may redact transcript or content fields based on
     * the caller-specific privacy resolution. See
     * <u>[List endpoints](/using-the-api/list-endpoints/)</u> for more information
     * about pagination.
     *
     * **[Required scope](/using-the-api/scopes/):** `meetings:read`
     *
     * **[Rate limit category](/using-the-api/rate-limits/):** Search
     */
    list(query?: MeetingListParams | null | undefined, options?: RequestOptions): APIPromise<MeetingListResponse>;
}
export interface MeetingCreateResponse {
    /**
     * Unique identifier for the entity.
     */
    id: string;
    /**
     * The caller's resolved access level for this meeting.
     */
    accessLevel: 'FULL' | 'METADATA';
    /**
     * ISO 8601 timestamp of when the entity was created.
     */
    createdAt: string;
    /**
     * Map of field names to their typed values. System fields are prefixed with `$`
     * (e.g. `$name`, `$email`); custom attributes use their bare slug.
     */
    fields: {
        [key: string]: MeetingCreateResponse.Fields;
    };
    /**
     * URL to view the entity in the Lightfield web app, or null.
     */
    httpLink: string | null;
    /**
     * Always `meeting`.
     */
    objectType: 'meeting';
    /**
     * Map of relationship names to their associated entities. System relationships are
     * prefixed with `$` (e.g. `$owner`, `$contact`).
     */
    relationships: {
        [key: string]: MeetingCreateResponse.Relationships;
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
export declare namespace MeetingCreateResponse {
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
export interface MeetingListResponse {
    /**
     * Array of meeting objects for the current page.
     */
    data: Array<MeetingListResponse.Data>;
    /**
     * The object type, always `"list"`.
     */
    object: string;
    /**
     * Total number of entities matching the query.
     */
    totalCount: number;
}
export declare namespace MeetingListResponse {
    interface Data {
        /**
         * Unique identifier for the entity.
         */
        id: string;
        /**
         * The caller's resolved access level for this meeting.
         */
        accessLevel: 'FULL' | 'METADATA';
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
         * Always `meeting`.
         */
        objectType: 'meeting';
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
export interface MeetingRetrieveResponse {
    /**
     * Unique identifier for the entity.
     */
    id: string;
    /**
     * The caller's resolved access level for this meeting.
     */
    accessLevel: 'FULL' | 'METADATA';
    /**
     * ISO 8601 timestamp of when the entity was created.
     */
    createdAt: string;
    /**
     * Map of field names to their typed values. System fields are prefixed with `$`
     * (e.g. `$name`, `$email`); custom attributes use their bare slug.
     */
    fields: {
        [key: string]: MeetingRetrieveResponse.Fields;
    };
    /**
     * URL to view the entity in the Lightfield web app, or null.
     */
    httpLink: string | null;
    /**
     * Always `meeting`.
     */
    objectType: 'meeting';
    /**
     * Map of relationship names to their associated entities. System relationships are
     * prefixed with `$` (e.g. `$owner`, `$contact`).
     */
    relationships: {
        [key: string]: MeetingRetrieveResponse.Relationships;
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
export declare namespace MeetingRetrieveResponse {
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
export interface MeetingUpdateResponse {
    /**
     * Unique identifier for the entity.
     */
    id: string;
    /**
     * The caller's resolved access level for this meeting.
     */
    accessLevel: 'FULL' | 'METADATA';
    /**
     * ISO 8601 timestamp of when the entity was created.
     */
    createdAt: string;
    /**
     * Map of field names to their typed values. System fields are prefixed with `$`
     * (e.g. `$name`, `$email`); custom attributes use their bare slug.
     */
    fields: {
        [key: string]: MeetingUpdateResponse.Fields;
    };
    /**
     * URL to view the entity in the Lightfield web app, or null.
     */
    httpLink: string | null;
    /**
     * Always `meeting`.
     */
    objectType: 'meeting';
    /**
     * Map of relationship names to their associated entities. System relationships are
     * prefixed with `$` (e.g. `$owner`, `$contact`).
     */
    relationships: {
        [key: string]: MeetingUpdateResponse.Relationships;
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
export declare namespace MeetingUpdateResponse {
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
export interface MeetingCreateParams {
    /**
     * Field values for the new MANUAL meeting. System fields use a `$` prefix (for
     * example `$title`, `$startDate`, `$endDate`). Required: `$title`, `$startDate`,
     * and `$endDate`. `$organizerEmail` accepts a single email address when provided;
     * `$attendeeEmails` accepts an array of email addresses. See
     * <u>[Fields and relationships](/using-the-api/fields-and-relationships/)</u> for
     * value type details.
     */
    fields: MeetingCreateParams.Fields;
    /**
     * When true, the initial post-create meeting sync may auto-create account and
     * contact records for external attendees.
     */
    autoCreateRecords?: boolean;
    /**
     * Relationships to set on the new meeting. Only `$transcript` is writable on
     * create; all other meeting relationships are system-managed.
     */
    relationships?: MeetingCreateParams.Relationships;
}
export declare namespace MeetingCreateParams {
    /**
     * Field values for the new MANUAL meeting. System fields use a `$` prefix (for
     * example `$title`, `$startDate`, `$endDate`). Required: `$title`, `$startDate`,
     * and `$endDate`. `$organizerEmail` accepts a single email address when provided;
     * `$attendeeEmails` accepts an array of email addresses. See
     * <u>[Fields and relationships](/using-the-api/fields-and-relationships/)</u> for
     * value type details.
     */
    interface Fields {
        /**
         * The end time of the meeting in ISO 8601 format. Must be in the past.
         */
        $endDate: string;
        /**
         * The start time of the meeting in ISO 8601 format. Must be in the past.
         */
        $startDate: string;
        /**
         * The title of the meeting.
         */
        $title: string;
        /**
         * A list of attendee email addresses.
         */
        $attendeeEmails?: Array<string>;
        /**
         * A description of the meeting.
         */
        $description?: string | null;
        /**
         * The URL for the meeting.
         */
        $meetingUrl?: string | null;
        /**
         * The email address of the meeting organizer. This field accepts a single email
         * address.
         */
        $organizerEmail?: string | null;
        /**
         * The privacy setting for the meeting (`FULL` or `METADATA`).
         */
        $privacySetting?: 'FULL' | 'METADATA' | null;
    }
    /**
     * Relationships to set on the new meeting. Only `$transcript` is writable on
     * create; all other meeting relationships are system-managed.
     */
    interface Relationships {
        /**
         * The ID of the file to attach as the meeting transcript when creating the
         * meeting. Only one transcript can be attached to a meeting.
         */
        $transcript: string | Array<string>;
    }
}
export interface MeetingUpdateParams {
    /**
     * Field values to update. Only `$privacySetting` is writable, and omitted fields
     * are left unchanged.
     */
    fields?: MeetingUpdateParams.Fields;
    /**
     * Relationship operations to apply. Only `$transcript.replace` is supported;
     * removing or clearing `$transcript` is not supported.
     */
    relationships?: MeetingUpdateParams.Relationships;
}
export declare namespace MeetingUpdateParams {
    /**
     * Field values to update. Only `$privacySetting` is writable, and omitted fields
     * are left unchanged.
     */
    interface Fields {
        /**
         * The privacy setting for the meeting.
         */
        $privacySetting: 'FULL' | 'METADATA' | null;
    }
    /**
     * Relationship operations to apply. Only `$transcript.replace` is supported;
     * removing or clearing `$transcript` is not supported.
     */
    interface Relationships {
        $transcript: Relationships.Transcript;
    }
    namespace Relationships {
        interface Transcript {
            /**
             * The file ID to set as the meeting transcript.
             */
            replace: string;
        }
    }
}
export interface MeetingListParams {
    /**
     * Maximum number of records to return. Defaults to 25, maximum 25.
     */
    limit?: number;
    /**
     * Number of records to skip for pagination. Defaults to 0.
     */
    offset?: number;
}
export declare namespace Meeting {
    export { type MeetingCreateResponse as MeetingCreateResponse, type MeetingListResponse as MeetingListResponse, type MeetingRetrieveResponse as MeetingRetrieveResponse, type MeetingUpdateResponse as MeetingUpdateResponse, type MeetingCreateParams as MeetingCreateParams, type MeetingUpdateParams as MeetingUpdateParams, type MeetingListParams as MeetingListParams, };
}
//# sourceMappingURL=meeting.d.ts.map