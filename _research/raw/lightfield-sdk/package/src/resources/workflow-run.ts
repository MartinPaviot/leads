// File generated from our OpenAPI spec by Stainless. See CONTRIBUTING.md for details.

import { APIResource } from '../core/resource';
import { APIPromise } from '../core/api-promise';
import { RequestOptions } from '../internal/request-options';
import { path } from '../internal/utils/path';

/**
 * Workflow runs represent executions of automated workflows.
 */
export class WorkflowRun extends APIResource {
  /**
   * Returns the current status of a workflow run.
   */
  status(runID: string, options?: RequestOptions): APIPromise<WorkflowRunStatusResponse> {
    return this._client.get(path`/v1/workflowRun/${runID}/status`, options);
  }
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
