/**
 * The only network the agent does: outbound HTTPS to the web app.
 *
 * Nothing listens on the office PC. There is no inbound port to scan, no
 * firewall hole to open, and the SQL Server credentials in config.json never
 * travel anywhere — only the punches do.
 */
export class Api {
  constructor(cfg) {
    this.base = cfg.apiUrl.replace(/\/+$/, '');
    this.key = cfg.agentKey;
  }

  async post(pathname, body) {
    const res = await fetch(`${this.base}/api/sync${pathname}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.key}`,
        'Content-Type': 'application/json',
        // The web app rejects anything outside a five-minute window, so a
        // captured request cannot be replayed later.
        'x-agent-timestamp': String(Date.now()),
      },
      body: JSON.stringify(body ?? {}),
      signal: AbortSignal.timeout(60_000),
    });

    const text = await res.text();
    let json;
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      json = { raw: text.slice(0, 300) };
    }

    if (!res.ok) {
      const err = new Error(json.error || `HTTP ${res.status}`);
      err.status = res.status;
      // A bad key stays bad; retrying it every 15 minutes forever is noise.
      err.fatal = res.status === 401 || res.status === 403;
      throw err;
    }
    return json;
  }

  hello() {
    return this.post('/hello');
  }

  sendPunches(punches) {
    return this.post('/punches', { punches });
  }

  dayComplete(date, punchCount) {
    return this.post('/day-complete', { date, punchCount, isComplete: true });
  }

  reportError(message) {
    return this.post('/error', { message: String(message).slice(0, 500) }).catch(() => {});
  }
}
