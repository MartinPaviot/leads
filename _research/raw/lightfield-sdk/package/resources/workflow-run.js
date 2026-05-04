"use strict";
// File generated from our OpenAPI spec by Stainless. See CONTRIBUTING.md for details.
Object.defineProperty(exports, "__esModule", { value: true });
exports.WorkflowRun = void 0;
const resource_1 = require("../core/resource.js");
const path_1 = require("../internal/utils/path.js");
/**
 * Workflow runs represent executions of automated workflows.
 */
class WorkflowRun extends resource_1.APIResource {
    /**
     * Returns the current status of a workflow run.
     */
    status(runID, options) {
        return this._client.get((0, path_1.path) `/v1/workflowRun/${runID}/status`, options);
    }
}
exports.WorkflowRun = WorkflowRun;
//# sourceMappingURL=workflow-run.js.map