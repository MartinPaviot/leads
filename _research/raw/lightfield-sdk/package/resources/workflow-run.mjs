// File generated from our OpenAPI spec by Stainless. See CONTRIBUTING.md for details.
import { APIResource } from "../core/resource.mjs";
import { path } from "../internal/utils/path.mjs";
/**
 * Workflow runs represent executions of automated workflows.
 */
export class WorkflowRun extends APIResource {
    /**
     * Returns the current status of a workflow run.
     */
    status(runID, options) {
        return this._client.get(path `/v1/workflowRun/${runID}/status`, options);
    }
}
//# sourceMappingURL=workflow-run.mjs.map