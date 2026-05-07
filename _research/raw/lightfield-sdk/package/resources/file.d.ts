import { APIResource } from "../core/resource.js";
import { APIPromise } from "../core/api-promise.js";
import { RequestOptions } from "../internal/request-options.js";
/**
 * Files are used to upload documents via presigned URLs. After uploading and completing a file, link it to resources through their own APIs (e.g. attach a transcript to a meeting). See <u>[File uploads](/using-the-api/file-uploads/)</u> for the full upload flow and supported purposes. For meeting transcript attachments, see <u>[Uploading meeting transcripts](/using-the-api/uploading-meeting-transcripts/)</u>.
 */
export declare class File extends APIResource {
    /**
     * Creates a new file upload session and returns an upload URL.
     *
     * After uploading the file bytes to `uploadUrl`, call
     * `POST /v1/files/{id}/complete` to finalize the upload. Optionally pass `purpose`
     * to validate MIME type and size constraints at creation time. See
     * <u>[File uploads](/using-the-api/file-uploads/)</u> for the full upload flow,
     * supported purposes, and size limits. If you are uploading a meeting transcript,
     * see
     * <u>[Uploading meeting transcripts](/using-the-api/uploading-meeting-transcripts/)</u>
     * for the follow-up meeting attachment flow.
     *
     * **[Required scope](/using-the-api/scopes/):** `files:create`
     *
     * **[Rate limit category](/using-the-api/rate-limits/):** Write
     */
    create(body: FileCreateParams, options?: RequestOptions): APIPromise<FileCreateResponse>;
    /**
     * Retrieves a single file by its ID.
     *
     * **[Required scope](/using-the-api/scopes/):** `files:read`
     *
     * **[Rate limit category](/using-the-api/rate-limits/):** Read
     */
    retrieve(id: string, options?: RequestOptions): APIPromise<FileRetrieveResponse>;
    /**
     * Returns a paginated list of files in your workspace. Use `offset` and `limit` to
     * paginate through results. See
     * <u>[List endpoints](/using-the-api/list-endpoints/)</u> for more information
     * about pagination.
     *
     * **[Required scope](/using-the-api/scopes/):** `files:read`
     *
     * **[Rate limit category](/using-the-api/rate-limits/):** Search
     */
    list(query?: FileListParams | null | undefined, options?: RequestOptions): APIPromise<FileListResponse>;
    /**
     * Cancels a pending upload by transitioning the file to `CANCELLED`. Only files in
     * `PENDING` status can be cancelled. **[Required scope](/using-the-api/scopes/):**
     * `files:create`
     *
     * **[Rate limit category](/using-the-api/rate-limits/):** Write
     */
    cancel(id: string, params?: FileCancelParams | null | undefined, options?: RequestOptions): APIPromise<FileCancelResponse>;
    /**
     * Finalizes an upload after the file bytes have been uploaded.
     *
     * If an optional `md5` hex digest is provided, the server validates the checksum
     * before marking the file as completed.
     *
     * **[Required scope](/using-the-api/scopes/):** `files:create`
     *
     * **[Rate limit category](/using-the-api/rate-limits/):** Write
     */
    complete(id: string, body: FileCompleteParams, options?: RequestOptions): APIPromise<FileCompleteResponse>;
    /**
     * Returns a temporary download URL for the file. Only available for files in
     * `COMPLETED` status.
     *
     * **[Required scope](/using-the-api/scopes/):** `files:read`
     *
     * **[Rate limit category](/using-the-api/rate-limits/):** Read
     */
    url(id: string, options?: RequestOptions): APIPromise<FileURLResponse>;
}
export interface FileCancelResponse {
    /**
     * Unique identifier for the file.
     */
    id: string;
    /**
     * When the file upload was completed.
     */
    completedAt: string | null;
    /**
     * When the file upload session was created.
     */
    createdAt: string;
    /**
     * When the upload session expires. Null once completed, cancelled, or expired.
     */
    expiresAt: string | null;
    /**
     * Original filename.
     */
    filename: string;
    /**
     * MIME type of the file.
     */
    mimeType: string;
    /**
     * File size in bytes.
     */
    sizeBytes: number;
    /**
     * Current upload status of the file.
     */
    status: 'PENDING' | 'COMPLETED' | 'CANCELLED' | 'EXPIRED';
}
export interface FileCompleteResponse {
    /**
     * Unique identifier for the file.
     */
    id: string;
    /**
     * When the file upload was completed.
     */
    completedAt: string | null;
    /**
     * When the file upload session was created.
     */
    createdAt: string;
    /**
     * When the upload session expires. Null once completed, cancelled, or expired.
     */
    expiresAt: string | null;
    /**
     * Original filename.
     */
    filename: string;
    /**
     * MIME type of the file.
     */
    mimeType: string;
    /**
     * File size in bytes.
     */
    sizeBytes: number;
    /**
     * Current upload status of the file.
     */
    status: 'PENDING' | 'COMPLETED' | 'CANCELLED' | 'EXPIRED';
}
export interface FileCreateResponse {
    /**
     * Unique identifier for the file.
     */
    id: string;
    /**
     * When the file upload was completed.
     */
    completedAt: string | null;
    /**
     * When the file upload session was created.
     */
    createdAt: string;
    /**
     * When the upload session expires. Null once completed, cancelled, or expired.
     */
    expiresAt: string | null;
    /**
     * Original filename.
     */
    filename: string;
    /**
     * MIME type of the file.
     */
    mimeType: string;
    /**
     * File size in bytes.
     */
    sizeBytes: number;
    /**
     * Current upload status of the file.
     */
    status: 'PENDING' | 'COMPLETED' | 'CANCELLED' | 'EXPIRED';
    /**
     * Headers to include in the upload request.
     */
    uploadHeaders: {
        [key: string]: string;
    };
    /**
     * Upload URL. Upload the file bytes directly to this URL.
     */
    uploadUrl: string;
}
export interface FileListResponse {
    /**
     * Array of file objects for the current page.
     */
    data: Array<FileListResponse.Data>;
    /**
     * The object type, always `"list"`.
     */
    object: string;
    /**
     * Total number of matching files.
     */
    totalCount: number;
}
export declare namespace FileListResponse {
    interface Data {
        /**
         * Unique identifier for the file.
         */
        id: string;
        /**
         * When the file upload was completed.
         */
        completedAt: string | null;
        /**
         * When the file upload session was created.
         */
        createdAt: string;
        /**
         * When the upload session expires. Null once completed, cancelled, or expired.
         */
        expiresAt: string | null;
        /**
         * Original filename.
         */
        filename: string;
        /**
         * MIME type of the file.
         */
        mimeType: string;
        /**
         * File size in bytes.
         */
        sizeBytes: number;
        /**
         * Current upload status of the file.
         */
        status: 'PENDING' | 'COMPLETED' | 'CANCELLED' | 'EXPIRED';
    }
}
export interface FileRetrieveResponse {
    /**
     * Unique identifier for the file.
     */
    id: string;
    /**
     * When the file upload was completed.
     */
    completedAt: string | null;
    /**
     * When the file upload session was created.
     */
    createdAt: string;
    /**
     * When the upload session expires. Null once completed, cancelled, or expired.
     */
    expiresAt: string | null;
    /**
     * Original filename.
     */
    filename: string;
    /**
     * MIME type of the file.
     */
    mimeType: string;
    /**
     * File size in bytes.
     */
    sizeBytes: number;
    /**
     * Current upload status of the file.
     */
    status: 'PENDING' | 'COMPLETED' | 'CANCELLED' | 'EXPIRED';
}
export interface FileURLResponse {
    /**
     * When the download URL expires.
     */
    expiresAt: string;
    /**
     * Temporary download URL for the file.
     */
    url: string;
}
export interface FileCreateParams {
    /**
     * Original filename.
     */
    filename: string;
    /**
     * MIME type of the file. Must be allowed for the given purpose (if specified).
     */
    mimeType: string;
    /**
     * Expected file size in bytes. Maximum 512 MB.
     */
    sizeBytes: number;
    /**
     * Optional validation hint. When provided, the server enforces purpose-specific
     * MIME type and file size constraints. Use `meeting_transcript` for files that
     * will be attached to a meeting as its transcript. Use `knowledge_user` or
     * `knowledge_workspace` to add the file to the authenticated user's or workspace's
     * Knowledge, making it available to the AI assistant. Not persisted or returned in
     * responses.
     */
    purpose?: 'meeting_transcript' | 'knowledge_user' | 'knowledge_workspace';
}
export interface FileListParams {
    /**
     * Maximum number of records to return. Defaults to 25, maximum 25.
     */
    limit?: number;
    /**
     * Number of records to skip for pagination. Defaults to 0.
     */
    offset?: number;
}
export interface FileCancelParams {
    body?: FileCancelParams.Body;
}
export declare namespace FileCancelParams {
    interface Body {
    }
}
export interface FileCompleteParams {
    /**
     * Optional MD5 hex digest of the uploaded file for checksum verification.
     */
    md5?: string;
}
export declare namespace File {
    export { type FileCancelResponse as FileCancelResponse, type FileCompleteResponse as FileCompleteResponse, type FileCreateResponse as FileCreateResponse, type FileListResponse as FileListResponse, type FileRetrieveResponse as FileRetrieveResponse, type FileURLResponse as FileURLResponse, type FileCreateParams as FileCreateParams, type FileListParams as FileListParams, type FileCancelParams as FileCancelParams, type FileCompleteParams as FileCompleteParams, };
}
//# sourceMappingURL=file.d.ts.map