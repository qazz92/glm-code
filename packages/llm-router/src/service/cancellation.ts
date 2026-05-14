/**
 * CancellationToken wraps AbortController for cooperative cancellation.
 * Safe to call cancel() multiple times; signal stays aborted.
 */
export class CancellationToken {
  private readonly ac = new AbortController()
  readonly signal = this.ac.signal

  cancel(): void {
    if (!this.ac.signal.aborted) this.ac.abort()
  }

  get cancelled(): boolean {
    return this.ac.signal.aborted
  }
}
