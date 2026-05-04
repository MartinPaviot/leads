import { APIResource } from "../core/resource.js";
import { APIPromise } from "../core/api-promise.js";
import { RequestOptions } from "../internal/request-options.js";
/**
 * Workflow runs represent executions of automated workflows.
 */
export declare class WorkflowRun extends APIResource {
    /**
     * Returns the current status of a workflow run.
     */
    status(runID: string, options?: RequestOptions): APIPromise<WorkflowRunStatusResponse>;
}
export interface WorkflowRunStatusResponse {
    /**
     * Current status of the workflow run (e.g. `running`, `completed`, `failed`).
     */
    status: string;
}
export declare namespace WorkflowRun {
    export { type WorkflowRunStatusResponse as WorkflowRunStatusResponse };
}
//# sourceMappingURL=workflow-run.d.ts.map