import type { RequestInit, RequestInfo } from "./internal/builtin-types.mjs";
import type { PromiseOrValue, MergedRequestInit, FinalizedRequestInit } from "./internal/types.mjs";
export type { Logger, LogLevel } from "./internal/utils/log.mjs";
import * as Opts from "./internal/request-options.mjs";
import * as Errors from "./core/error.mjs";
import * as Uploads from "./core/uploads.mjs";
import * as API from "./resources/index.mjs";
import { APIPromise } from "./core/api-promise.mjs";
import { Account, AccountCreateParams, AccountCreateResponse, AccountDefinitionsResponse, AccountListParams, AccountListResponse, AccountRetrieveResponse, AccountUpdateParams, AccountUpdateResponse } from "./resources/account.mjs";
import { Contact, ContactCreateParams, ContactCreateResponse, ContactDefinitionsResponse, ContactListParams, ContactListResponse, ContactRetrieveResponse, ContactUpdateParams, ContactUpdateResponse } from "./resources/contact.mjs";
import { File, FileCancelParams, FileCancelResponse, FileCompleteParams, FileCompleteResponse, FileCreateParams, FileCreateResponse, FileListParams, FileListResponse, FileRetrieveResponse, FileURLResponse } from "./resources/file.mjs";
import { List, ListCreateParams, ListCreateResponse, ListListAccountsParams, ListListAccountsResponse, ListListContactsParams, ListListContactsResponse, ListListOpportunitiesParams, ListListOpportunitiesResponse, ListListParams, ListListResponse, ListRetrieveResponse, ListUpdateParams, ListUpdateResponse } from "./resources/list.mjs";
import { Meeting, MeetingCreateParams, MeetingCreateResponse, MeetingListParams, MeetingListResponse, MeetingRetrieveResponse, MeetingUpdateParams, MeetingUpdateResponse } from "./resources/meeting.mjs";
import { Member, MemberListParams, MemberListResponse, MemberRetrieveResponse } from "./resources/member.mjs";
import { Note, NoteCreateParams, NoteCreateResponse, NoteListParams, NoteListResponse, NoteRetrieveResponse, NoteUpdateParams, NoteUpdateResponse } from "./resources/note.mjs";
import { Opportunity, OpportunityCreateParams, OpportunityCreateResponse, OpportunityDefinitionsResponse, OpportunityListParams, OpportunityListResponse, OpportunityRetrieveResponse, OpportunityUpdateParams, OpportunityUpdateResponse } from "./resources/opportunity.mjs";
import { Task, TaskCreateParams, TaskCreateResponse, TaskDefinitionsResponse, TaskListParams, TaskListResponse, TaskRetrieveResponse, TaskUpdateParams, TaskUpdateResponse } from "./resources/task.mjs";
import { WorkflowRun, WorkflowRunStatusResponse } from "./resources/workflow-run.mjs";
import { type Fetch } from "./internal/builtin-types.mjs";
import { HeadersLike, NullableHeaders } from "./internal/headers.mjs";
import { FinalRequestOptions, RequestOptions } from "./internal/request-options.mjs";
import { type LogLevel, type Logger } from "./internal/utils/log.mjs";
export interface ClientOptions {
    apiKey: string;
    /**
     * Override the default base URL for the API, e.g., "https://api.example.com/v2/"
     *
     * Defaults to process.env['LIGHTFIELD_BASE_URL'].
     */
    baseURL?: string | null | undefined;
    /**
     * The maximum amount of time (in milliseconds) that the client should wait for a response
     * from the server before timing out a single request.
     *
     * Note that request timeouts are retried by default, so in a worst-case scenario you may wait
     * much longer than this timeout before the promise succeeds or fails.
     *
     * @unit milliseconds
     */
    timeout?: number | undefined;
    /**
     * Additional `RequestInit` options to be passed to `fetch` calls.
     * Properties will be overridden by per-request `fetchOptions`.
     */
    fetchOptions?: MergedRequestInit | undefined;
    /**
     * Specify a custom `fetch` function implementation.
     *
     * If not provided, we expect that `fetch` is defined globally.
     */
    fetch?: Fetch | undefined;
    /**
     * The maximum number of times that the client will retry a request in case of a
     * temporary failure, like a network error or a 5XX error from the server.
     *
     * @default 2
     */
    maxRetries?: number | undefined;
    /**
     * Default headers to include with every request to the API.
     *
     * These can be removed in individual requests by explicitly setting the
     * header to `null` in request options.
     */
    defaultHeaders?: HeadersLike | undefined;
    /**
     * Default query parameters to include with every request to the API.
     *
     * These can be removed in individual requests by explicitly setting the
     * param to `undefined` in request options.
     */
    defaultQuery?: Record<string, string | undefined> | undefined;
    /**
     * Set the log level.
     *
     * Defaults to process.env['LIGHTFIELD_LOG'] or 'warn' if it isn't set.
     */
    logLevel?: LogLevel | undefined;
    /**
     * Set the logger.
     *
     * Defaults to globalThis.console.
     */
    logger?: Logger | undefined;
}
/**
 * API Client for interfacing with the Lightfield API.
 */
export declare class Lightfield {
    #private;
    apiKey: string;
    baseURL: string;
    maxRetries: number;
    timeout: number;
    logger: Logger;
    logLevel: LogLevel | undefined;
    fetchOptions: MergedRequestInit | undefined;
    private fetch;
    protected idempotencyHeader?: string;
    private _options;
    /**
     * API Client for interfacing with the Lightfield API.
     *
     * @param {string} opts.apiKey
     * @param {string} [opts.baseURL=process.env['LIGHTFIELD_BASE_URL'] ?? https://api.lightfield.app] - Override the default base URL for the API.
     * @param {number} [opts.timeout=1 minute] - The maximum amount of time (in milliseconds) the client will wait for a response before timing out.
     * @param {MergedRequestInit} [opts.fetchOptions] - Additional `RequestInit` options to be passed to `fetch` calls.
     * @param {Fetch} [opts.fetch] - Specify a custom `fetch` function implementation.
     * @param {number} [opts.maxRetries=2] - The maximum number of times the client will retry a request.
     * @param {HeadersLike} opts.defaultHeaders - Default headers to include with every request to the API.
     * @param {Record<string, string | undefined>} opts.defaultQuery - Default query parameters to include with every request to the API.
     */
    constructor({ baseURL, apiKey, ...opts }: ClientOptions);
    /**
     * Create a new client instance re-using the same options given to the current client with optional overriding.
     */
    withOptions(options: Partial<ClientOptions>): this;
    protected defaultQuery(): Record<string, string | undefined> | undefined;
    protected validateHeaders({ values, nulls }: NullableHeaders): void;
    protected authHeaders(opts: FinalRequestOptions): Promise<NullableHeaders | undefined>;
    /**
     * Basic re-implementation of `qs.stringify` for primitive types.
     */
    protected stringifyQuery(query: object | Record<string, unknown>): string;
    private getUserAgent;
    protected defaultIdempotencyKey(): string;
    protected makeStatusError(status: number, error: Object, message: string | undefined, headers: Headers): Errors.APIError;
    buildURL(path: string, query: Record<string, unknown> | null | undefined, defaultBaseURL?: string | undefined): string;
    /**
     * Used as a callback for mutating the given `FinalRequestOptions` object.
     */
    protected prepareOptions(options: FinalRequestOptions): Promise<void>;
    /**
     * Used as a callback for mutating the given `RequestInit` object.
     *
     * This is useful for cases where you want to add certain headers based off of
     * the request properties, e.g. `method` or `url`.
     */
    protected prepareRequest(request: RequestInit, { url, options }: {
        url: string;
        options: FinalRequestOptions;
    }): Promise<void>;
    get<Rsp>(path: string, opts?: PromiseOrValue<RequestOptions>): APIPromise<Rsp>;
    post<Rsp>(path: string, opts?: PromiseOrValue<RequestOptions>): APIPromise<Rsp>;
    patch<Rsp>(path: string, opts?: PromiseOrValue<RequestOptions>): APIPromise<Rsp>;
    put<Rsp>(path: string, opts?: PromiseOrValue<RequestOptions>): APIPromise<Rsp>;
    delete<Rsp>(path: string, opts?: PromiseOrValue<RequestOptions>): APIPromise<Rsp>;
    private methodRequest;
    request<Rsp>(options: PromiseOrValue<FinalRequestOptions>, remainingRetries?: number | null): APIPromise<Rsp>;
    private makeRequest;
    fetchWithTimeout(url: RequestInfo, init: RequestInit | undefined, ms: number, controller: AbortController): Promise<Response>;
    private shouldRetry;
    private retryRequest;
    private calculateDefaultRetryTimeoutMillis;
    buildRequest(inputOptions: FinalRequestOptions, { retryCount }?: {
        retryCount?: number;
    }): Promise<{
        req: FinalizedRequestInit;
        url: string;
        timeout: number;
    }>;
    private buildHeaders;
    private _makeAbort;
    private buildBody;
    static Lightfield: typeof Lightfield;
    static DEFAULT_TIMEOUT: number;
    static LightfieldError: typeof Errors.LightfieldError;
    static APIError: typeof Errors.APIError;
    static APIConnectionError: typeof Errors.APIConnectionError;
    static APIConnectionTimeoutError: typeof Errors.APIConnectionTimeoutError;
    static APIUserAbortError: typeof Errors.APIUserAbortError;
    static NotFoundError: typeof Errors.NotFoundError;
    static ConflictError: typeof Errors.ConflictError;
    static RateLimitError: typeof Errors.RateLimitError;
    static BadRequestError: typeof Errors.BadRequestError;
    static AuthenticationError: typeof Errors.AuthenticationError;
    static InternalServerError: typeof Errors.InternalServerError;
    static PermissionDeniedError: typeof Errors.PermissionDeniedError;
    static UnprocessableEntityError: typeof Errors.UnprocessableEntityError;
    static toFile: typeof Uploads.toFile;
    /**
     * Accounts represent companies or organizations in Lightfield. Each account can have contacts, opportunities, tasks, and notes associated with it.
     */
    account: API.Account;
    /**
     * Contacts represent individual people in Lightfield. Contacts can be associated with one or more accounts.
     */
    contact: API.Contact;
    /**
     * Lists are curated collections of accounts, contacts, or opportunities in Lightfield. Each list contains entities of a single type.
     */
    list: API.List;
    /**
     * Meetings represent synced or manually created interactions in Lightfield. Read responses are privacy-aware and may be redacted based on the caller. For transcript uploads and attachment flows, see <u>[Uploading meeting transcripts](/using-the-api/uploading-meeting-transcripts/)</u>.
     */
    meeting: API.Meeting;
    /**
     * Notes represent free-form text records in Lightfield. Each note can be associated with zero or more accounts and opportunities.
     */
    note: API.Note;
    /**
     * Opportunities represent potential deals or sales in Lightfield. Each opportunity belongs to an account and can have tasks and notes associated with it.
     */
    opportunity: API.Opportunity;
    /**
     * Tasks represent action items in Lightfield. Each task belongs to an account, is assigned to a member, and can optionally be associated with an opportunity.
     */
    task: API.Task;
    /**
     * Members represent users in your Lightfield workspace. Members can own accounts and opportunities, and are referenced in relationships like `$owner` and `$createdBy`.
     */
    member: API.Member;
    /**
     * Workflow runs represent executions of automated workflows.
     */
    workflowRun: API.WorkflowRun;
    /**
     * Files are used to upload documents via presigned URLs. After uploading and completing a file, link it to resources through their own APIs (e.g. attach a transcript to a meeting). See <u>[File uploads](/using-the-api/file-uploads/)</u> for the full upload flow and supported purposes. For meeting transcript attachments, see <u>[Uploading meeting transcripts](/using-the-api/uploading-meeting-transcripts/)</u>.
     */
    file: API.File;
}
export declare namespace Lightfield {
    export type RequestOptions = Opts.RequestOptions;
    export { Account as Account, type AccountCreateResponse as AccountCreateResponse, type AccountDefinitionsResponse as AccountDefinitionsResponse, type AccountListResponse as AccountListResponse, type AccountRetrieveResponse as AccountRetrieveResponse, type AccountUpdateResponse as AccountUpdateResponse, type AccountCreateParams as AccountCreateParams, type AccountUpdateParams as AccountUpdateParams, type AccountListParams as AccountListParams, };
    export { Contact as Contact, type ContactCreateResponse as ContactCreateResponse, type ContactDefinitionsResponse as ContactDefinitionsResponse, type ContactListResponse as ContactListResponse, type ContactRetrieveResponse as ContactRetrieveResponse, type ContactUpdateResponse as ContactUpdateResponse, type ContactCreateParams as ContactCreateParams, type ContactUpdateParams as ContactUpdateParams, type ContactListParams as ContactListParams, };
    export { List as List, type ListCreateResponse as ListCreateResponse, type ListListAccountsResponse as ListListAccountsResponse, type ListListContactsResponse as ListListContactsResponse, type ListListOpportunitiesResponse as ListListOpportunitiesResponse, type ListListResponse as ListListResponse, type ListRetrieveResponse as ListRetrieveResponse, type ListUpdateResponse as ListUpdateResponse, type ListCreateParams as ListCreateParams, type ListUpdateParams as ListUpdateParams, type ListListParams as ListListParams, type ListListAccountsParams as ListListAccountsParams, type ListListContactsParams as ListListContactsParams, type ListListOpportunitiesParams as ListListOpportunitiesParams, };
    export { Meeting as Meeting, type MeetingCreateResponse as MeetingCreateResponse, type MeetingListResponse as MeetingListResponse, type MeetingRetrieveResponse as MeetingRetrieveResponse, type MeetingUpdateResponse as MeetingUpdateResponse, type MeetingCreateParams as MeetingCreateParams, type MeetingUpdateParams as MeetingUpdateParams, type MeetingListParams as MeetingListParams, };
    export { Note as Note, type NoteCreateResponse as NoteCreateResponse, type NoteListResponse as NoteListResponse, type NoteRetrieveResponse as NoteRetrieveResponse, type NoteUpdateResponse as NoteUpdateResponse, type NoteCreateParams as NoteCreateParams, type NoteUpdateParams as NoteUpdateParams, type NoteListParams as NoteListParams, };
    export { Opportunity as Opportunity, type OpportunityCreateResponse as OpportunityCreateResponse, type OpportunityDefinitionsResponse as OpportunityDefinitionsResponse, type OpportunityListResponse as OpportunityListResponse, type OpportunityRetrieveResponse as OpportunityRetrieveResponse, type OpportunityUpdateResponse as OpportunityUpdateResponse, type OpportunityCreateParams as OpportunityCreateParams, type OpportunityUpdateParams as OpportunityUpdateParams, type OpportunityListParams as OpportunityListParams, };
    export { Task as Task, type TaskCreateResponse as TaskCreateResponse, type TaskDefinitionsResponse as TaskDefinitionsResponse, type TaskListResponse as TaskListResponse, type TaskRetrieveResponse as TaskRetrieveResponse, type TaskUpdateResponse as TaskUpdateResponse, type TaskCreateParams as TaskCreateParams, type TaskUpdateParams as TaskUpdateParams, type TaskListParams as TaskListParams, };
    export { Member as Member, type MemberListResponse as MemberListResponse, type MemberRetrieveResponse as MemberRetrieveResponse, type MemberListParams as MemberListParams, };
    export { WorkflowRun as WorkflowRun, type WorkflowRunStatusResponse as WorkflowRunStatusResponse };
    export { File as File, type FileCancelResponse as FileCancelResponse, type FileCompleteResponse as FileCompleteResponse, type FileCreateResponse as FileCreateResponse, type FileListResponse as FileListResponse, type FileRetrieveResponse as FileRetrieveResponse, type FileURLResponse as FileURLResponse, type FileCreateParams as FileCreateParams, type FileListParams as FileListParams, type FileCancelParams as FileCancelParams, type FileCompleteParams as FileCompleteParams, };
}
//# sourceMappingURL=client.d.mts.map