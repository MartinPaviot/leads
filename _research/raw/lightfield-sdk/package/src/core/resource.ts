// File generated from our OpenAPI spec by Stainless. See CONTRIBUTING.md for details.

import type { Lightfield } from '../client';

export abstract class APIResource {
  protected _client: Lightfield;

  constructor(client: Lightfield) {
    this._client = client;
  }
}
