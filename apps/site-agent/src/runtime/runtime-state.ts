export class RuntimeState {
  #running = false;
  #lastCloudSuccessAt: Date | undefined;

  get running(): boolean {
    return this.#running;
  }

  get lastCloudSuccessAt(): Date | undefined {
    return this.#lastCloudSuccessAt;
  }

  markStarted(): void {
    this.#running = true;
  }

  markStopped(): void {
    this.#running = false;
  }

  markCloudSuccess(at: Date): void {
    this.#lastCloudSuccessAt = at;
  }
}
