export class CountdownTimer {
  #intervalId = null;
  #endAt = 0;
  #lastSeconds = null;

  start(durationSeconds, onTick, onEnd) {
    this.stop();
    this.#endAt = Date.now() + durationSeconds * 1000;

    const update = () => {
      const secondsLeft = Math.max(0, Math.ceil((this.#endAt - Date.now()) / 1000));
      if (secondsLeft !== this.#lastSeconds) {
        this.#lastSeconds = secondsLeft;
        onTick(secondsLeft);
      }
      if (secondsLeft === 0) {
        this.stop();
        onEnd();
      }
    };

    update();
    this.#intervalId = setInterval(update, 200);
  }

  stop() {
    if (this.#intervalId !== null) clearInterval(this.#intervalId);
    this.#intervalId = null;
    this.#lastSeconds = null;
  }
}
