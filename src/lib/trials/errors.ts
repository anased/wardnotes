// src/lib/trials/errors.ts

/** A user-facing problem resolving or searching a trial source; `status` is the HTTP status to return. */
export class TrialSourceError extends Error {
  constructor(message: string, public status: number) {
    super(message);
    this.name = 'TrialSourceError';
  }
}
