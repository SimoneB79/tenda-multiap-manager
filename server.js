/**
 * Tenda Multi-AP Manager — Express server.
 */
const express = require('express');
const fs = require('fs');
const path = require('path');
const mqtt = require('mqtt');
const TendaClient = require('./lib/tenda');
const { getModuleDef } = require('./lib/modules');
const { diffSnapshots, groupByCategory, diffSummary } = require('./lib/diff');

const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 32 * 1024 * 1024 } });

const app = express();
const PORT = process.env.PORT || 3000;

// ── Config ──────────────────────────────────────────────
const CONFIG_PATH = path.join(__dirname, 'config', 'aps.json');

function loadConfig() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
  } catch {
    return { aps: [], password_env: 'TENDA_PASSWORD' };
  }
}

function saveConfig(config) {
  const dir = path.dirname(CONFIG_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}

function isSetupComplete() {
  const config = loadConfig();
  return config.aps && config.aps.length > 0;
}

function getPassword() {
  const envVar = loadConfig().password_env || 'TENDA_PASSWORD';
  return process.env[envVar] || '';
}

// ── Client pool ─────────────────────────────────────────
const clients = new Map(); // id → TendaClient

function getClient(id) {
  if (clients.has(id)) return clients.get(id);
  const config = loadConfig();
  const ap = config.aps.find(a => a.id === id);
  if (!ap) return null;
  if (ap.enabled === false) return null;
  const client = new TendaClient(ap.ip, getPassword(), { model: ap.model, location: ap.location });
  client._meta = { id: ap.id, name: ap.name, location: ap.location };
  clients.set(id, client);
  return client;
}

function refreshClients() {
  clients.clear();
}

// ── Middleware ───────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use('/js', express.static(path.join(__dirname, 'public', 'js'), { maxAge: '1d' }));
app.use('/css', express.static(path.join(__dirname, 'public', 'css'), { maxAge: '1d' }));
app.use(express.static(path.join(__dirname, 'public'), { maxAge: 0 }));

// ── Setup / Discovery API ───────────────────────────────

// Check if setup is needed
app.get('/api/setup/status', (_req, res) => {
  res.json({ setupComplete: isSetupComplete() });
});

// Scan subnet for Tenda APs
app.post('/api/setup/discover', async (req, res) => {
  const { subnet } = req.body; // e.g. "192.168.0"
  if (!subnet || !/^\d+\.\d+\.\d+$/.test(subnet)) {
    return res.status(400).json({ error: 'Invalid subnet. Use format: 192.168.0' });
  }

  const found = [];
  const promises = [];

  for (let i = 1; i <= 254; i++) {
    const ip = `${subnet}.${i}`;
    promises.push(
      (async () => {
        try {
          const client = new TendaClient(ip, '');
          const identity = await client.fetchIdentity();
          if (identity.model) {
            found.push({ ip, model: identity.model, firmware: identity.firmware || null });
          }
        } catch {
          // Not a Tenda AP — skip
        }
      })()
    );
  }

  // Run all scans with a global timeout
  await Promise.race([
    Promise.allSettled(promises),
    new Promise(resolve => setTimeout(resolve, 15000)), // 15s max
  ]);

  // Sort by IP
  found.sort((a, b) => {
    const na = a.ip.split('.').map(Number);
    const nb = b.ip.split('.').map(Number);
    for (let i = 0; i < 4; i++) {
      if (na[i] !== nb[i]) return na[i] - nb[i];
    }
    return 0;
  });

  res.json({ found });
});

// Test connection to an AP with a password
app.post('/api/setup/test', async (req, res) => {
  const { ip, password } = req.body;
  if (!ip || !password) {
    return res.status(400).json({ error: 'IP and password are required' });
  }

  try {
    const client = new TendaClient(ip, password);
    const identity = await client.fetchIdentity();
    if (!identity.model) {
      return res.json({ success: false, error: 'No Tenda AP detected at this address' });
    }
    // Try login
    const loginResult = await client.login();
    res.json({
      success: true,
      model: identity.model,
      firmware: identity.firmware,
      firmwareDate: identity.firmwareDate,
    });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// Save setup configuration (APs + optional password env var name)
app.post('/api/setup/save', (req, res) => {
  const { aps, password_env } = req.body;
  if (!aps || !aps.length) {
    return res.status(400).json({ error: 'At least one AP is required' });
  }

  // Validate APs
  for (const ap of aps) {
    if (!ap.id || !ap.name || !ap.ip) {
      return res.status(400).json({ error: 'Each AP needs id, name, and ip' });
    }
    if (!ap.model) ap.model = 'i27V1.1';
    if (!ap.location) ap.location = '';
  }

  const config = {
    password_env: password_env || 'TENDA_PASSWORD',
    refresh_interval_ms: 30000,
    aps,
  };

  saveConfig(config);
  refreshClients();
  res.json({ success: true });
});

// ── API Routes ──────────────────────────────────────────

// Health check
app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));

// List APs with status
app.get('/api/aps', async (_req, res) => {
  const config = loadConfig();
  const password = getPassword();
  const results = [];

  for (const ap of config.aps) {
    const entry = { ...ap, online: false, model: ap.model, firmware: null, error: null };
    if (ap.enabled === false) {
      entry.error = 'Disabled';
      results.push(entry);
      continue;
    }
    try {
      const client = new TendaClient(ap.ip, password, { model: ap.model, location: ap.location });
      const ping = await client.ping();
      entry.online = ping.online;
      entry.model = ping.model || ap.model;
      entry.firmware = ping.firmware;
      entry.firmwareDate = ping.firmwareDate;
      entry.error = ping.error || null;
      client._meta = { id: ap.id, name: ap.name, location: ap.location };
      clients.set(ap.id, client);
    } catch (err) {
      entry.error = err.message;
    }
    results.push(entry);
  }
  res.json(results);
});

// Get AP config snapshot
app.get('/api/aps/:id/snapshot', async (req, res) => {
  const client = getClient(req.params.id);
  if (!client) return res.status(404).json({ error: 'AP not found or disabled' });

  try {
    const moduleDef = getModuleDef(client.model);
    const snapshot = await client.snapshot(moduleDef.snapshotBatches());
    res.json({
      id: client._meta.id,
      name: client._meta.name,
      location: client._meta.location,
      ip: client.host,
      model: client.model,
      firmware: client.firmware,
      firmwareDate: client.firmwareDate,
      online: client.online,
      snapshot,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Compare two APs
app.get('/api/aps/:id1/compare/:id2', async (req, res) => {
  const { id1, id2 } = req.params;
  const client1 = getClient(id1);
  const client2 = getClient(id2);

  if (!client1 || !client2) return res.status(404).json({ error: 'AP not found or disabled' });

  try {
    const def1 = getModuleDef(client1.model);
    const def2 = getModuleDef(client2.model);
    const [snap1, snap2] = await Promise.all([
      client1.snapshot(def1.snapshotBatches()),
      client2.snapshot(def2.snapshotBatches()),
    ]);

    const diff = diffSnapshots(snap1, snap2);
    res.json({
      left: { id: id1, name: client1._meta.name, ip: client1.host, model: client1.model },
      right: { id: id2, name: client2._meta.name, ip: client2.host, model: client2.model },
      diff,
      grouped: groupByCategory(diff),
      summary: diffSummary(diff),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Write config to AP
app.post('/api/aps/:id/set', async (req, res) => {
  const client = getClient(req.params.id);
  if (!client) return res.status(404).json({ error: 'AP not found or disabled' });

  const { module: moduleName, params } = req.body;
  if (!moduleName || !params) return res.status(400).json({ error: 'Missing module or params' });

  try {
    const result = await client.setModule(moduleName, params);
    res.json({ success: true, result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update AP inventory
app.post('/api/config/aps', (req, res) => {
  const config = loadConfig();
  config.aps = req.body.aps || config.aps;
  saveConfig(config);
  refreshClients();
  res.json({ success: true });
});

// Cleanup unused SSIDs
app.post('/api/cleanup/ssids', async (req, res) => {
  const { targets } = req.body;
  if (!targets || !targets.length) return res.status(400).json({ error: 'No targets' });
  const results = {};
  for (const apId of targets) {
    const client = getClient(apId);
    if (!client) { results[apId] = { success: false, error: 'AP not found' }; continue; }
    try {
      const def = getModuleDef(client.model);
      let count = 0;
      for (const radio of def.radios) {
        for (let i = 1; i < def.maxSsid; i++) {
          await client.setModule('wifiBasicSetIndoor', { radio, ssidIndex: String(i), ssid: '-', ssidEn: false, broadcastSsid: false, maxClientNum: '0', staIsolate: false, wmf: false, ssidIsolate: false, ssidEncode: 'utf-8' });
          count++;
        }
      }
      results[apId] = { success: true, count };
    } catch (err) { results[apId] = { success: false, error: err.message }; }
  }
  res.json({ results });
});

// Reboot AP(s)
app.post('/api/reboot', async (req, res) => {
  const { targets } = req.body;
  if (!targets || !targets.length) return res.status(400).json({ error: 'No targets' });
  const results = {};
  for (const apId of targets) {
    const client = getClient(apId);
    if (!client) { results[apId] = { success: false, error: 'AP not found' }; continue; }
    try {
      await client.setModule('sysReboot', {});
      results[apId] = { success: true };
    } catch (err) { results[apId] = { success: false, error: err.message }; }
  }
  res.json({ results });
});

// Uplink Detection get/set
app.post('/api/aps/:id/uplink', async (req, res) => {
  const client = getClient(req.params.id);
  if (!client) return res.status(404).json({ error: 'AP not found' });
  const { enable, timeInterval, hostIp1, hostIp2 } = req.body;
  try {
    await client.setModule('sysUplinkCheckSet', { enable, timeInterval: timeInterval || '10', hostIp1: hostIp1 || '', hostIp2: hostIp2 || '' });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// List available modules per model
app.get('/api/modules/:model', (req, res) => {
  const def = getModuleDef(req.params.model);
  res.json({
    label: def.label,
    radios: def.radios,
    maxSsid: def.maxSsid,
    writable: def.writableModules,
  });
});

// ── Firmware Upgrade API ──────────────────────────────────

app.get('/api/aps/:id/firmware', async (req, res) => {
  const client = getClient(req.params.id);
  if (!client) return res.status(404).json({ error: 'AP not found' });
  try {
    await client.login();
    const data = await client.getModules({ sysUpgradeGet: {} });
    res.json({
      id: client._meta.id,
      name: client._meta.name,
      ip: client.host,
      model: client.model,
      firmware: (data.sysUpgradeGet || {}).version || null,
      firmwareDate: (data.sysUpgradeGet || {}).date || null,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/aps/:id/firmware/check', async (req, res) => {
  const client = getClient(req.params.id);
  if (!client) return res.status(404).json({ error: 'AP not found' });
  try {
    await client.login();
    const data = await client.getModules({ getSoftWareUpgrade: {} });
    const info = data.getSoftWareUpgrade || {};
    res.json({
      id: client._meta.id,
      name: client._meta.name,
      status: info.status,
      newVersion: info.new_version || null,
      description: info.description || null,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/aps/:id/firmware/online-upgrade', async (req, res) => {
  const client = getClient(req.params.id);
  if (!client) return res.status(404).json({ error: 'AP not found' });
  try {
    await client.login();
    const data = await client.getModules({ goDownload: {} });
    res.json({
      id: client._meta.id,
      name: client._meta.name,
      status: (data.goDownload || {}).status,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/aps/:id/firmware/upload', upload.single('firmware'), async (req, res) => {
  const client = getClient(req.params.id);
  if (!client) return res.status(404).json({ error: 'AP not found' });
  if (!req.file) return res.status(400).json({ error: 'No firmware file uploaded' });
  const originalName = req.file.originalname || '';
  if (!originalName.endsWith('.bin')) {
    return res.status(400).json({ error: 'File must be .bin format' });
  }
  try {
    if (!client.cookie) await client.login();
    const FormData = require('form-data');
    const form = new FormData();
    form.append('FormUpload', req.file.buffer, {
      filename: originalName,
      contentType: 'application/octet-stream',
    });
    const fetchUrl = `http://${client.host}/cgi-bin/upgrade`;
    const httpRes = await require('node-fetch')(fetchUrl, {
      method: 'POST',
      body: form,
      headers: { ...form.getHeaders(), Cookie: client.cookie },
      timeout: 120000,
    });
    const text = await httpRes.text();
    let data;
    try { data = JSON.parse(text); } catch { data = { raw: text }; }

    const errCode = data.errCode;
    const errMap = {
      '0': 'Success — rebooting (~3 min)',
      '1000': 'Invalid mirroring',
      '1001': 'File format error',
      '1002': 'Firmware verification failed',
      '1003': 'Wrong file size',
      '1004': 'Generic upgrade error',
      '1005': 'Insufficient memory',
    };

    res.json({
      id: client._meta.id,
      name: client._meta.name,
      success: errCode === '0',
      errCode,
      message: errMap[errCode] || `Error code: ${errCode}`,
      raw: data,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/firmware/batch-upload', upload.single('firmware'), async (req, res) => {
  const { targets } = req.body;
  if (!targets) return res.status(400).json({ error: 'No targets' });
  const targetList = typeof targets === 'string' ? JSON.parse(targets) : targets;
  if (!targetList.length) return res.status(400).json({ error: 'No targets' });
  if (!req.file) return res.status(400).json({ error: 'No firmware file uploaded' });
  const originalName = req.file.originalname || '';
  if (!originalName.endsWith('.bin')) {
    return res.status(400).json({ error: 'File must be .bin format' });
  }

  const results = {};
  for (const apId of targetList) {
    const client = getClient(apId);
    if (!client) { results[apId] = { success: false, error: 'AP not found' }; continue; }
    try {
      if (!client.cookie) await client.login();
      const FormData = require('form-data');
      const form = new FormData();
      form.append('FormUpload', req.file.buffer, {
        filename: originalName,
        contentType: 'application/octet-stream',
      });
      const fetchUrl = `http://${client.host}/cgi-bin/upgrade`;
      const httpRes = await require('node-fetch')(fetchUrl, {
        method: 'POST',
        body: form,
        headers: { ...form.getHeaders(), Cookie: client.cookie },
        timeout: 120000,
      });
      const text = await httpRes.text();
      let data;
      try { data = JSON.parse(text); } catch { data = { raw: text }; }
      results[apId] = {
        success: data.errCode === '0',
        errCode: data.errCode,
        message: data.errCode === '0' ? 'Upload OK — rebooting' : `Error ${data.errCode}`,
      };
      if (data.errCode === '0') await new Promise(r => setTimeout(r, 2000));
    } catch (err) {
      results[apId] = { success: false, error: err.message };
    }
  }
  res.json({ results });
});

// ── MQTT Integration (optional) ──────────────────────────
const MQTT_BROKER = process.env.MQTT_BROKER || '';
const MQTT_BASE = 'homeassistant/sensor/tenda_ap';
const POLL_INTERVAL = parseInt(process.env.POLL_INTERVAL || '120', 10) * 1000;

let mqttClient = null;
let pollTimer = null;
const apStatus = new Map();

function getMqttOptions() {
  return {
    clientId: 'tenda-panel',
    clean: true,
    reconnectPeriod: 5000,
    username: process.env.MQTT_USER || '',
    password: process.env.MQTT_PASSWORD || '',
  };
}

function initMqtt() {
  if (!MQTT_BROKER) {
    console.log('[MQTT] No broker configured — MQTT disabled');
    return;
  }
  try {
    mqttClient = mqtt.connect(MQTT_BROKER, getMqttOptions());
    mqttClient.on('connect', () => console.log('[MQTT] Connected to', MQTT_BROKER));
    mqttClient.on('error', (err) => console.error('[MQTT] Error:', err.message));
    mqttClient.on('offline', () => console.log('[MQTT] Offline'));
    publishDiscovery();
    startPolling();
  } catch (e) {
    console.error('[MQTT] Init failed:', e.message);
  }
}

function publishDiscovery() {
  const config = loadConfig();
  for (const ap of config.aps) {
    if (ap.enabled === false) continue;
    const discMain = {
      uniq_id: `tenda_${ap.id}`,
      name: null,
      object_id: `ap_${ap.id}`,
      state_topic: `${MQTT_BASE}/${ap.id}/state`,
      json_attributes_topic: `${MQTT_BASE}/${ap.id}/attrs`,
      device: { identifiers: [`tenda_${ap.id}`], name: `AP ${ap.name}`, manufacturer: 'Tenda', model: ap.model || 'i27V1.1' },
      icon: 'mdi:access-point-network',
    };
    mqttClient.publish(`${MQTT_BASE}/${ap.id}/config`, JSON.stringify(discMain), { retain: true, qos: 1 });
  }
}

async function pollApStatus() {
  const config = loadConfig();
  for (const ap of config.aps) {
    if (ap.enabled === false) continue;
    const client = getClient(ap.id);
    if (!client) continue;
    try {
      const def = getModuleDef(client.model);
      const status = { online: false, clients_24g: 0, clients_5g: 0, channel_24g: '', channel_5g: '', power_24g: '', power_5g: '', ssid: '', ip: ap.ip, location: ap.location || '' };
      
      const snap = await client.snapshot([
        [{ name: 'wifiRadioGetIndoor', params: { radio: def.radios[0] }, key: 'radio_24g' }],
        [{ name: 'wifiRadioGetIndoor', params: { radio: def.radios[1] }, key: 'radio_5g' }],
        [{ name: 'wifiClientList', params: { radio: def.radios[0], ssidIndex: '' }, key: 'clients_24g' }],
        [{ name: 'wifiClientList', params: { radio: def.radios[1], ssidIndex: '' }, key: 'clients_5g' }],
        [{ name: 'wifiBasicGetIndoor', params: { radio: def.radios[0], ssidIndex: '0' }, key: 'ssid0' }],
      ]);
      
      status.online = true;
      const r24 = (snap.radio_24g || {}).data || {};
      const r5 = (snap.radio_5g || {}).data || {};
      const c24 = (snap.clients_24g || {}).data || [];
      const c5 = (snap.clients_5g || {}).data || [];
      const s0 = (snap.ssid0 || {}).data || {};
      
      status.channel_24g = r24.channel || '';
      status.channel_5g = r5.channel || '';
      status.power_24g = r24.currentPower || '';
      status.power_5g = r5.currentPower || '';
      status.clients_24g = Array.isArray(c24) ? c24.length : 0;
      status.clients_5g = Array.isArray(c5) ? c5.length : 0;
      status.ssid = s0.ssid || '';
      status.last_seen = new Date().toISOString();
      
      mqttClient.publish(`${MQTT_BASE}/${ap.id}/state`, 'online', { retain: true, qos: 1 });
      mqttClient.publish(`${MQTT_BASE}/${ap.id}/attrs`, JSON.stringify(status), { retain: true, qos: 1 });
      apStatus.set(ap.id, status);
    } catch (err) {
      mqttClient.publish(`${MQTT_BASE}/${ap.id}/state`, 'offline', { retain: true, qos: 1 });
      mqttClient.publish(`${MQTT_BASE}/${ap.id}/attrs`, JSON.stringify({ online: false, ip: ap.ip, last_error: err.message, last_seen: (apStatus.get(ap.id) || {}).last_seen || '' }), { retain: true, qos: 1 });
      apStatus.set(ap.id, { ...apStatus.get(ap.id), online: false });
    }
  }
}

function startPolling() {
  pollApStatus();
  pollTimer = setInterval(pollApStatus, POLL_INTERVAL);
}

app.get('/api/status/mqtt', (req, res) => {
  const out = {};
  for (const [id, s] of apStatus) out[id] = s;
  res.json(out);
});

// ── Start ───────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`Tenda Multi-AP Manager listening on port ${PORT}`);
  if (isSetupComplete()) {
    initMqtt();
  } else {
    console.log('Setup required — open the UI to configure your APs');
  }
});
