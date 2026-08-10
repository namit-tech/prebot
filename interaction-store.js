/**
 * InteractionStore — durable local record of every question the kiosk answered.
 *
 * Replaces the in-memory `chatHistory` array in embedded-backend.js, which was lost on
 * every restart and never left the machine. Records accumulate here and are drained by
 * the sync uploader; a kiosk that is offline for a whole event keeps everything and
 * ships it once it reconnects.
 *
 * Format is JSONL (one JSON object per line) rather than a single JSON array: appending
 * is a single write with no read-modify-write cycle, and a torn line from a power cut
 * costs one record instead of the whole file.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// A kiosk that never reaches the network must not grow without bound.
const MAX_UNSYNCED = 5000;        // hard ceiling; oldest are dropped past this
const SYNCED_RETENTION_MS = 7 * 24 * 60 * 60 * 1000; // keep synced rows a week for local views
const COMPACT_EVERY = 200;        // appends between rewrites of the file

class InteractionStore {
  constructor(userDataPath) {
    this.filePath = path.join(userDataPath, 'interactions.jsonl');
    this._appendsSinceCompact = 0;
  }

  /**
   * Append one record.
   *
   * Two types share this log:
   *   'interaction' — a question the kiosk answered (usage patterns)
   *   'usage'       — a finished Gemini Live session (minutes + tokens, for cost)
   *
   * Tenant identity is supplied by the caller from a *verified* session — never from
   * the renderer, which cannot be trusted to state its own identity.
   *
   * @param {object} rec
   * @returns {object|null} the stored record
   */
  append(rec) {
    try {
      const record = {
        id: crypto.randomUUID(),
        ts: new Date().toISOString(),
        type: 'interaction',
        synced: false,
        ...rec,
      };
      fs.appendFileSync(this.filePath, JSON.stringify(record) + '\n', 'utf8');

      if (++this._appendsSinceCompact >= COMPACT_EVERY) this.compact();
      return record;
    } catch (err) {
      // Analytics must never break the assistant — a failed write is dropped silently.
      console.warn('[Interactions] append failed:', err.message);
      return null;
    }
  }

  /** All readable records. Torn or malformed lines are skipped rather than fatal. */
  readAll() {
    try {
      if (!fs.existsSync(this.filePath)) return [];
      return fs
        .readFileSync(this.filePath, 'utf8')
        .split('\n')
        .filter((l) => l.trim())
        .map((line) => {
          try { return JSON.parse(line); } catch (e) { return null; }
        })
        .filter(Boolean);
    } catch (err) {
      console.warn('[Interactions] read failed:', err.message);
      return [];
    }
  }

  /** Oldest-first batch awaiting upload. */
  getUnsynced(limit = 100) {
    return this.readAll().filter((r) => !r.synced).slice(0, limit);
  }

  /** Mark a batch as delivered. Called only after the server has acknowledged it. */
  markSynced(ids) {
    if (!ids || !ids.length) return;
    const set = new Set(ids);
    const now = new Date().toISOString();
    const updated = this.readAll().map((r) =>
      set.has(r.id) ? { ...r, synced: true, syncedAt: now } : r
    );
    this._rewrite(updated);
  }

  /**
   * Drop delivered records past the retention window, and enforce the unsynced ceiling
   * so an permanently-offline kiosk cannot fill its disk.
   */
  compact() {
    const all = this.readAll();
    const cutoff = Date.now() - SYNCED_RETENTION_MS;

    const kept = all.filter((r) => {
      if (!r.synced) return true;
      const at = Date.parse(r.syncedAt || r.ts);
      return Number.isFinite(at) ? at > cutoff : true;
    });

    // Oldest unsynced go first — recent questions are the more useful signal.
    const unsynced = kept.filter((r) => !r.synced);
    if (unsynced.length > MAX_UNSYNCED) {
      const drop = new Set(unsynced.slice(0, unsynced.length - MAX_UNSYNCED).map((r) => r.id));
      console.warn(`[Interactions] unsynced ceiling reached — dropping ${drop.size} oldest`);
      this._rewrite(kept.filter((r) => !drop.has(r.id)));
    } else {
      this._rewrite(kept);
    }
    this._appendsSinceCompact = 0;
  }

  /** Counts for the local UI and for deciding whether a sync run is worthwhile. */
  stats() {
    const all = this.readAll();
    return {
      total: all.length,
      unsynced: all.filter((r) => !r.synced).length,
      interactions: all.filter((r) => r.type === 'interaction').length,
      sessions: all.filter((r) => r.type === 'usage').length,
      oldest: all.length ? all[0].ts : null,
      newest: all.length ? all[all.length - 1].ts : null,
    };
  }

  /**
   * Local roll-up of Gemini Live consumption — the same shape the superadmin view will
   * show per tenant, so the aggregation logic is proven before it moves server-side.
   *
   * Cost is deliberately NOT computed here: rates change and vary by model, and a wrong
   * number shown to a client is worse than no number. Minutes and tokens are the facts;
   * pricing is applied at the point of display, where the rate table can be updated.
   *
   * @param {{since?: string}} [opts]
   */
  usageSummary(opts = {}) {
    const since = opts.since ? Date.parse(opts.since) : null;
    const sessions = this.readAll().filter(
      (r) => r.type === 'usage' && (!since || Date.parse(r.ts) >= since)
    );

    const byModel = {};
    let connectedMs = 0;
    let totalTokens = 0;
    let turns = 0;
    let sessionsMissingTokens = 0;

    for (const s of sessions) {
      const m = s.model || 'unknown';
      byModel[m] = byModel[m] || { sessions: 0, connectedMs: 0, totalTokens: 0, turns: 0, modalities: {} };
      byModel[m].sessions++;
      byModel[m].connectedMs += Number(s.connectedMs) || 0;
      byModel[m].totalTokens += Number(s.totalTokens) || 0;
      byModel[m].turns += Number(s.turns) || 0;
      for (const [modality, count] of Object.entries(s.modalities || {})) {
        byModel[m].modalities[modality] = (byModel[m].modalities[modality] || 0) + (Number(count) || 0);
      }

      connectedMs += Number(s.connectedMs) || 0;
      totalTokens += Number(s.totalTokens) || 0;
      turns += Number(s.turns) || 0;
      if (!s.tokensReported) sessionsMissingTokens++;
    }

    return {
      sessions: sessions.length,
      connectedMs,
      connectedMinutes: Math.round((connectedMs / 60000) * 100) / 100,
      connectedHours: Math.round((connectedMs / 3600000) * 100) / 100,
      totalTokens,
      turns,
      byModel,
      // Surfaced so a partial figure is never mistaken for a complete one.
      sessionsMissingTokens,
    };
  }

  /** Atomic-ish replace: write beside the target, then rename over it. */
  _rewrite(records) {
    try {
      const tmp = `${this.filePath}.tmp`;
      fs.writeFileSync(tmp, records.map((r) => JSON.stringify(r)).join('\n') + (records.length ? '\n' : ''), 'utf8');
      fs.renameSync(tmp, this.filePath);
    } catch (err) {
      console.warn('[Interactions] rewrite failed:', err.message);
    }
  }
}

module.exports = InteractionStore;
