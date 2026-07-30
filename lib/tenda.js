/**
 * Tenda AP API client.
 * Handles login, session cookies, module GET/SET via /goform/modules.
 * Uses native fetch with Connection: close (Tenda embedded HTTP server
 * doesn't handle keep-alive properly — causes intermittent hangs).
 */

const LOGIN_TIMEOUT = 8000;
const QUERY_TIMEOUT = 8000;
const RETRY_LOGIN = 2;

// Per-AP mutex: serialize all operations to avoid session conflicts
// (Tenda i27 only supports 1 active admin session)
const _apLocks = new Map();
function apLock(host) {
  if (!_apLocks.has(host)) _apLocks.set(host, Promise.resolve());
  const prev = _apLocks.get(host);
  let resolve;
  const next = new Promise(r => { resolve = r; });
  _apLocks.set(host, prev.then(() => next));
  return { prev, done: resolve };
}

class TendaClient {
  constructor(host, password, options = {}) {
    this.host = host;
    this.password = password;
    this.model = options.model || 'i27V1.1';
    this.location = options.location || '';
    this.cookie = null;
    this.lastError = null;
    this.online = false;
    this.firmware = null;
    this.firmwareDate = null;
  }

  async _post(path, body, timeoutMs) {
    const headers = {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'Connection': 'close',
    };
    if (this.cookie) headers['Cookie'] = this.cookie;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(`http://${this.host}${path}`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
      return res;
    } finally {
      clearTimeout(timer);
    }
  }

  async login() {
    const enc = Buffer.from(this.password).toString('base64');
    const now = new Date();
    const time = [now.getFullYear(), now.getMonth() + 1, now.getDate(),
      now.getHours(), now.getMinutes(), now.getSeconds()].join(';');
    const res = await this._post('/goform/modules?login',
      { sysLogin: { password: enc, logoff: false, timeZone: 20, time } }, LOGIN_TIMEOUT);
    const data = await res.json();
    if (!data.sysLogin?.Login) {
      this.online = false;
      this.lastError = `Login failed: ${JSON.stringify(data.sysLogin || data)}`;
      throw new Error(this.lastError);
    }
    const sc = res.headers.getSetCookie?.();
    if (sc && sc.length > 0) this.cookie = sc[0].split(';')[0];
    this.online = true;
    this.lastError = null;
    return data.sysLogin;
  }

  async request(payload, retries = RETRY_LOGIN) {
    if (!this.cookie) await this.login();
    try {
      const res = await this._post(`/goform/modules?${Date.now()}`, payload, QUERY_TIMEOUT);
      const text = await res.text();
      // Some modules (e.g. sysReboot on OAP1200) return empty body on success
      if (!text || !text.trim()) return {};
      const data = JSON.parse(text);
      if (data.errCode === 'logout') {
        this.cookie = null;
        if (retries > 0) return this.request(payload, retries - 1);
        throw new Error('Session expired, re-login failed');
      }
      return data;
    } catch (err) {
      if (err.name === 'TimeoutError' || err.name === 'AbortError') {
        this.online = false;
        this.lastError = 'Request timed out';
      }
      throw err;
    }
  }

  async getModules(payload) { return this.request(payload); }

  /** Query modules with custom timeout (for first-attempt fast-fail). */
  async _getModulesWithTimeout(payload, timeoutMs) {
    if (!this.cookie) await this.login();
    try {
      const res = await this._post(`/goform/modules?${Date.now()}`, payload, timeoutMs);
      const data = await res.json();
      if (data.errCode === 'logout') {
        this.cookie = null;
        throw new Error('Session expired');
      }
      return data;
    } catch (err) {
      if (err.name === 'AbortError') { this.online = false; this.lastError = 'Timed out'; }
      throw err;
    }
  }

  async setModule(name, params) {
    const lock = apLock(this.host);
    await lock.prev;
    try { return await this.request({ [name]: params }); }
    finally { lock.done(); }
  }

  /** Fetch system identity from macro_config.js (no auth needed). */
  async fetchIdentity() {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), LOGIN_TIMEOUT);
    try {
      const res = await fetch(`http://${this.host}/config/macro_config.js`, {
        signal: ctrl.signal,
      });
      const text = await res.text();
      const get = (key) => {
        const m = text.match(new RegExp(`var ${key} ="([^"]+)";`));
        return m ? m[1] : null;
      };
      this.model = get('CONFIG_PRODUCT_MODEL') || this.model;
      this.firmware = get('CONFIG_FIRWARE_VERION');
      this.firmwareDate = get('CONFIG_FIRWARE_DATE');
      this.online = true;
      return { model: this.model, firmware: this.firmware, firmwareDate: this.firmwareDate };
    } catch (err) {
      this.online = false;
      this.lastError = (err.name === 'TimeoutError' || err.name === 'AbortError') ? 'Unreachable' : err.message;
      return { model: this.model, firmware: null, firmwareDate: null, error: this.lastError };
    } finally {
      clearTimeout(timer);
    }
  }

  /** Take a full config snapshot with retry on failed batches. Serialized per-AP. */
  async snapshot(modules) {
    const lock = apLock(this.host);
    await lock.prev;
    try {
      return await this._snapshotInner(modules);
    } finally {
      lock.done();
    }
  }

  async _snapshotInner(modules) {
    const result = {};
    // Warmup: do a throwaway single-module query to prime the session
    // (Tenda i27 consistently drops the first module query after login)
    if (!this._warmedUp) {
      try { await this._getModulesWithTimeout({ wifiWorkMode: { radio: 'ap' } }, 2000); } catch {}
      this._warmedUp = true;
    }
    for (const batch of modules) {
      const payload = {};
      for (const mod of batch) {
        payload[mod.name] = mod.customBody !== undefined ? mod.customBody : { ...mod.params };
      }
      let done = false;
      for (let attempt = 0; attempt < 2 && !done; attempt++) {
        try {
          if (attempt > 0) { this.cookie = null; await this.login(); }
          const data = await this.getModules(payload);
          for (const mod of batch) {
            const key = mod.key || mod.name;
            result[key] = { ...mod, data: data[mod.name] || null };
          }
          done = true;
        } catch (err) {
          if (attempt === 1) {
            for (const mod of batch) {
              const key = mod.key || mod.name;
              result[key] = { ...mod, data: null, error: err.message };
            }
          }
        }
      }
    }
    return result;
  }

  /** Quick ping: identity only (no login — avoids session conflicts with snapshot). */
  async ping() {
    const id = await this.fetchIdentity();
    if (id.error) return { online: false, error: id.error };
    return { online: true, model: this.model, firmware: this.firmware, firmwareDate: this.firmwareDate };
  }
}

module.exports = TendaClient;
