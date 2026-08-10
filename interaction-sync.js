/**
 * InteractionSync — ships locally recorded interactions and API-usage records to the
 * licence server so the superadmin view can report per tenant.
 *
 * Built offline-first on purpose: these kiosks routinely run a whole event with no
 * network (that is the product). Nothing is ever dropped because a upload failed —
 * records stay unsynced locally and go out on a later run.
 *
 * Records are only marked synced after the server acknowledges them, so a crash
 * mid-upload re-sends rather than loses. The server must therefore treat record `id`
 * as an idempotency key.
 */

const BATCH_SIZE = 100;
const RETRY_BASE_MS = 60 * 1000;      // first retry after a failure
const RETRY_MAX_MS = 30 * 60 * 1000;  // cap the backoff at 30 minutes

class InteractionSync {
  /**
   * @param {object} opts
   * @param {import('./interaction-store')} opts.store
   * @param {() => ({apiBase:string, serverToken:string}|null)} opts.getAuth
   * @param {number} [opts.intervalMs] normal cadence between runs
   */
  constructor({ store, getAuth, intervalMs = 10 * 60 * 1000 }) {
    this.store = store;
    this.getAuth = getAuth;
    this.intervalMs = intervalMs;
    this.timer = null;
    this.running = false;
    this.consecutiveFailures = 0;
  }

  start() {
    if (this.timer) return;
    // A short first run catches anything left over from the previous session.
    this._schedule(30 * 1000);
    console.log('[Sync] interaction sync started');
  }

  stop() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  _schedule(delayMs) {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.run().catch(() => {}), delayMs);
  }

  /** Backoff grows with consecutive failures so an offline venue isn't retried hard. */
  _nextDelay() {
    if (!this.consecutiveFailures) return this.intervalMs;
    const backoff = RETRY_BASE_MS * Math.pow(2, this.consecutiveFailures - 1);
    return Math.min(backoff, RETRY_MAX_MS);
  }

  async run() {
    if (this.running) return;
    this.running = true;

    try {
      const auth = this.getAuth?.();
      if (!auth?.apiBase || !auth?.serverToken) {
        // Not licensed / not logged in — hold everything for later.
        this._schedule(this.intervalMs);
        return;
      }

      const batch = this.store.getUnsynced(BATCH_SIZE);
      if (!batch.length) {
        this.consecutiveFailures = 0;
        this._schedule(this.intervalMs);
        return;
      }

      const res = await fetch(`${auth.apiBase}/admin/interactions/batch`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${auth.serverToken}`,
        },
        body: JSON.stringify({ records: batch }),
      });

      if (!res.ok) {
        // 4xx other than auth means the server rejected this payload shape; retrying
        // identical data forever would spin. Log loudly and back off either way.
        console.warn(`[Sync] upload rejected (${res.status}) — ${batch.length} records held`);
        this.consecutiveFailures++;
        this._schedule(this._nextDelay());
        return;
      }

      this.store.markSynced(batch.map((r) => r.id));
      this.consecutiveFailures = 0;
      console.log(`[Sync] uploaded ${batch.length} records`);

      // More waiting? Drain promptly rather than waiting a full interval.
      const remaining = this.store.getUnsynced(1).length;
      this._schedule(remaining ? 5 * 1000 : this.intervalMs);
    } catch (err) {
      // Offline is the expected case here, not an error worth alarming about.
      console.log('[Sync] deferred:', err.message);
      this.consecutiveFailures++;
      this._schedule(this._nextDelay());
    } finally {
      this.running = false;
    }
  }
}

module.exports = InteractionSync;
