/**
 * Tenda AP API client.
 * Handles login, session cookies, module GET/SET via /goform/modules.
 */
const fetch = require('node-fetch');

const LOGIN_TIMEOUT = 8000;
const QUERY_TIMEOUT = 12000;
const RETRY_LOGIN = 1;

class TendaClient {
  constructor(host, password, options = {}) {
    this.host = host;
    this.password = password;
    this.model = options.model || 'i27V1.1';
    this.location = options.location || '';
    this.cookie = null;
    this.baseUrl = `http://${host}`;
    this.lastError = null;
    this.online = false;
    this.firmware = null;
    this.firmwareDate = null;
  }

  async _doFetch(path, body, timeout) {
    const headers = { 'Accept': 'application/json', 'Content-Type': 'application/json' };
    if (this.cookie) headers['Cookie'] = this.cookie;
    const url = `${this.baseUrl}${path}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      return res;
    } finally {
      clearTimeout(timer);
    }
  }

  async login() {
    const enc = Buffer.from(this.password).toString('base64');
    const now = new Date();
    const time = [
      now.getFullYear(), now.getMonth() + 1, now.getDate(),
      now.getHours(), now.getMinutes(), now.getSeconds()
    ].join(';');
    const body = { sysLogin: { password: enc, logoff: false, timeZone: 20, time } };

    const res = await this._doFetch('/goform/modules?login', body, LOGIN_TIMEOUT);
    const data = await res.json();
    if (!data.sysLogin?.Login) {
      this.online = false;
      this.lastError = `Login failed: ${JSON.stringify(data.sysLogin || data)}`;
      throw new Error(this.lastError);
    }
    const rawCookies = res.headers.raw?.()?.['set-cookie'];
    if (rawCookies && rawCookies.length > 0) {
      this.cookie = rawCookies[0].split(';')[0];
    }
    this.online = true;
    this.lastError = null;
    return data.sysLogin;
  }

  async request(payload, retries = RETRY_LOGIN) {
    if (!this.cookie) await this.login();
    try {
      const res = await this._doFetch(`/goform/modules?${Date.now()}`, payload, QUERY_TIMEOUT);
      const data = await res.json();
      if (data.errCode === 'logout') {
        this.cookie = null;
        if (retries > 0) return this.request(payload, retries - 1);
        throw new Error('Session expired, re-login failed');
      }
      return data;
    } catch (err) {
      if (err.name === 'AbortError') {
        this.online = false;
        this.lastError = 'Request timed out';
      }
      throw err;
    }
  }

  async getModules(payload) {
    return this.request(payload);
  }

  async setModule(name, params) {
    return this.request({ [name]: params });
  }

  async fetchIdentity() {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), LOGIN_TIMEOUT);
    try {
      const res = await fetch(`${this.baseUrl}/config/macro_config.js`, { signal: controller.signal });
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
      this.lastError = err.name === 'AbortError' ? 'Unreachable' : err.message;
      return { model: this.model, firmware: null, firmwareDate: null, error: this.lastError };
    } finally {
      clearTimeout(timer);
    }
  }

  async snapshot(modules) {
    const result = {};
    for (const batch of modules) {
      try {
        const payload = {};
        for (const mod of batch) {
          payload[mod.name] = { ...mod.params };
        }
        const data = await this.getModules(payload);
        for (const mod of batch) {
          const key = mod.key || mod.name;
          result[key] = { ...mod, data: data[mod.name] || null };
        }
      } catch (err) {
        for (const mod of batch) {
          const key = mod.key || mod.name;
          result[key] = { ...mod, data: null, error: err.message };
        }
      }
    }
    return result;
  }

  async ping() {
    const id = await this.fetchIdentity();
    if (id.error) return { online: false, error: id.error };
    try {
      await this.login();
      return { online: true, model: this.model, firmware: this.firmware, firmwareDate: this.firmwareDate };
    } catch (err) {
      return { online: false, model: this.model, firmware: this.firmware, error: err.message };
    }
  }
}

module.exports = TendaClient;