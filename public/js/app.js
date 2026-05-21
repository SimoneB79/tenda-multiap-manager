/**
 * Tenda Multi-AP Manager — Vue 3 frontend with Setup Wizard
 */
const { createApp, ref, computed, watch, onMounted } = Vue;

const API = {
  async get(url) {
    const res = await fetch(url);
    if (!res.ok) { const e = await res.json().catch(() => ({ error: res.statusText })); throw new Error(e.error || res.statusText); }
    return res.json();
  },
  async post(url, body) {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!res.ok) { const e = await res.json().catch(() => ({ error: res.statusText })); throw new Error(e.error || res.statusText); }
    return res.json();
  },
};

const PASSWORD_FIELDS = new Set(['wpapskPwd', 'password', 'radiusKey', 'wepKey1', 'wepKey2', 'wepKey3', 'wepKey4']);
const READONLY_FIELDS = new Set([
  'ssidList', 'ssidEnList', 'avalidClientNum', 'ssidIndex', 'radio',
  'wepKeyType1', 'wepKeyType2', 'wepKeyType3', 'wepKeyType4',
  'radiusPwdInterval', 'wpapskPwdInterval', 'radiusIp', 'radiusPort', 'radiusKey', 'wepDefaultKey',
  'minPower', 'maxPower', 'probeEn', 'channelOffset', 'extChannel', 'countryCode',
]);

const FIELD_OPTIONS = {
  secType: ['none', 'wep', 'wpa-psk', 'wpa2-psk', 'mixed wpa/wpa2-psk', 'wpa3sae', 'wpa3saewpa2psk'],
  wpapskAuth: ['aes', 'tkip', 'tkip+aes'],
  wepAuth: ['open', 'share', '802.1x'],
  ssidEncode: ['utf-8', 'gb2312'],
  bandwidth: ['20', '40', '80', '160'],
  netMode: ['bgnax', '11b/g/n/ax', 'bgn', 'bg', 'b', 'acax', 'ac', 'an', 'a'],
};

const CATEGORY_LABELS = {
  system: 'System',
  radio: 'Radio',
  wifi: 'Wi-Fi',
  roaming: 'Roaming',
  clients: 'Clients',
  network: 'Network',
  other: 'Other',
};
const CATEGORY_ORDER = ['system', 'radio', 'wifi', 'roaming', 'clients', 'network', 'other'];

createApp({
  setup() {
    // ── Core state ──
    const aps = ref([]); const loading = ref(false); const view = ref('dashboard');
    const selectedAp = ref(null); const snapshot = ref(null); const snapshotLoading = ref(false);
    const editMode = ref(false); const edits = ref({}); const saving = ref(false);
    const activeTab = ref(null);
    const compareLeft = ref(''); const compareRight = ref('');
    const compareResult = ref(null); const compareLoading = ref(false);
    const bulkTargets = ref([]); const bulkSource = ref('');
    const bulkSourceData = ref(null); const bulkSaving = ref(false); const bulkResults = ref(null);
    const cleaning = ref(false); const cleanupResults = ref(null);
    const rebootTargets = ref([]); const rebootModal = ref(false); const rebooting = ref(false); const rebootResults = ref(null);
    const uplinkTargets = ref([]); const uplinkSaving = ref(false); const uplinkResults = ref(null);
    const uplinkConfig = ref({ hostIp1: '192.168.0.1', hostIp2: '8.8.8.8', timeInterval: '10' });
    const toasts = ref([]); let toastId = 0;
    const fwInfo = ref([]); const fwLoading = ref(false); const fwOnlineCheck = ref(false);
    const fwBatchTargets = ref([]); const fwBatchUploading = ref(false); const fwBatchResults = ref(null);

    // ── Setup Wizard state ──
    const setupNeeded = ref(false);
    const setupStep = ref(1); // 1=discover, 2=configure, 3=done
    const setupSubnet = ref('192.168.0');
    const setupDiscovering = ref(false);
    const setupDiscovered = ref([]);
    const setupPassword = ref('');
    const setupSelectedAps = ref([]); // array of discovered APs the user selected
    const setupTesting = ref(false);
    const setupTestResults = ref({}); // ip -> {success, error}
    const setupSaving = ref(false);

    // ── Settings state ──
    const showSettings = ref(false);
    const settingsAps = ref([]);
    const settingsPassword = ref('');
    const settingsSaving = ref(false);
    const settingsAdding = ref(false);
    const settingsNewAp = ref({ id: '', name: '', ip: '', model: 'i27V1.1', location: '' });
    const settingsDiscovering = ref(false);
    const settingsDiscovered = ref([]);

    const onlineCount = computed(() => aps.value.filter(a => a.online).length);
    const onlineAps = computed(() => aps.value.filter(a => a.online && a.enabled !== false));

    const groupedSnapshot = computed(() => {
      if (!snapshot.value) return {};
      const groups = {};
      for (const [key, mod] of Object.entries(snapshot.value)) {
        const cat = mod.category || 'other';
        if (!groups[cat]) groups[cat] = [];
        groups[cat].push({ ...mod, key });
      }
      const sorted = {};
      for (const cat of CATEGORY_ORDER) { if (groups[cat]) sorted[cat] = groups[cat]; }
      for (const cat of Object.keys(groups)) { if (!sorted[cat]) sorted[cat] = groups[cat]; }
      return sorted;
    });

    const snapshotCategories = computed(() => Object.keys(groupedSnapshot.value));

    const filteredSnapshot = computed(() => {
      if (!activeTab.value) return groupedSnapshot.value;
      const g = groupedSnapshot.value;
      return activeTab.value && g[activeTab.value] ? { [activeTab.value]: g[activeTab.value] } : {};
    });

    const totalClients = computed(() => {
      if (!snapshot.value) return 0;
      let total = 0;
      for (const mod of Object.values(snapshot.value)) {
        if (mod.category === 'clients' && Array.isArray(mod.data)) total += mod.data.length;
      }
      return total;
    });

    function toast(msg, type = 'info') {
      const id = ++toastId; toasts.value.push({ id, message: msg, type });
      setTimeout(() => { toasts.value = toasts.value.filter(t => t.id !== id); }, 4000);
    }

    // ── Setup check ──
    async function checkSetup() {
      try {
        const data = await API.get('/api/setup/status');
        setupNeeded.value = !data.setupComplete;
        if (setupNeeded.value) {
          view.value = 'setup';
        }
      } catch { /* ignore */ }
    }

    // ── Setup Wizard functions ──
    async function runDiscovery() {
      setupDiscovering.value = true;
      setupDiscovered.value = [];
      try {
        const data = await API.post('/api/setup/discover', { subnet: setupSubnet.value });
        setupDiscovered.value = data.found;
        if (data.found.length === 0) {
          toast('No Tenda APs found on this subnet', 'error');
        } else {
          toast(`Found ${data.found.length} Tenda AP(s)`, 'success');
          // Auto-select all
          setupSelectedAps.value = data.found.map(a => ({ ...a, selected: true, name: `AP ${a.ip.split('.')[3]}` }));
        }
      } catch (e) {
        toast('Discovery error: ' + e.message, 'error');
      }
      setupDiscovering.value = false;
    }

    async function testSetupConnections() {
      setupTesting.value = true;
      setupTestResults.value = {};
      for (const ap of setupSelectedAps.value) {
        if (!ap.selected) continue;
        try {
          const result = await API.post('/api/setup/test', { ip: ap.ip, password: setupPassword.value });
          setupTestResults.value[ap.ip] = result;
          if (result.success) {
            ap.model = result.model;
          }
        } catch (e) {
          setupTestResults.value[ap.ip] = { success: false, error: e.message };
        }
      }
      setupTesting.value = false;
      const ok = Object.values(setupTestResults.value).filter(r => r.success).length;
      const err = Object.values(setupTestResults.value).filter(r => !r.success).length;
      if (ok > 0 && err === 0) toast(`All ${ok} AP(s) connected successfully`, 'success');
      else if (ok > 0) toast(`${ok} OK, ${err} failed`, 'warning');
      else toast('No APs could be reached', 'error');
    }

    async function saveSetup() {
      setupSaving.value = true;
      const apsToSave = setupSelectedAps.value
        .filter(a => a.selected)
        .map(a => ({
          id: 'ap-' + a.ip.split('.').join('-'),
          name: a.name || `AP ${a.ip.split('.')[3]}`,
          ip: a.ip,
          model: a.model || 'i27V1.1',
          location: a.location || '',
        }));

      if (apsToSave.length === 0) {
        toast('Select at least one AP', 'error');
        setupSaving.value = false;
        return;
      }

      try {
        await API.post('/api/setup/save', { aps: apsToSave });
        setupStep.value = 3;
        setupNeeded.value = false;
        toast('Setup complete!', 'success');
        // Reload APs
        await refreshAll();
        view.value = 'dashboard';
      } catch (e) {
        toast('Save error: ' + e.message, 'error');
      }
      setupSaving.value = false;
    }

    function addManualAp() {
      setupSelectedAps.value.push({
        ip: '',
        name: '',
        model: 'i27V1.1',
        selected: true,
        manual: true,
      });
    }

    function removeSetupAp(index) {
      setupSelectedAps.value.splice(index, 1);
    }

    // ── Settings functions ──
    function openSettings() {
      settingsAps.value = JSON.parse(JSON.stringify(aps.value));
      settingsPassword.value = '';
      showSettings.value = true;
    }

    async function settingsDiscover() {
      settingsDiscovering.value = true;
      settingsDiscovered.value = [];
      try {
        // Guess subnet from first AP
        const firstIp = settingsAps.value.length > 0 ? settingsAps.value[0].ip : '192.168.0.1';
        const subnet = firstIp.split('.').slice(0, 3).join('.');
        const data = await API.post('/api/setup/discover', { subnet });
        // Filter out already-added APs
        const existingIps = new Set(settingsAps.value.map(a => a.ip));
        settingsDiscovered.value = data.found.filter(a => !existingIps.has(a.ip));
        if (settingsDiscovered.value.length === 0) toast('No new APs found', 'info');
        else toast(`Found ${settingsDiscovered.value.length} new AP(s)`, 'success');
      } catch (e) {
        toast('Discovery error: ' + e.message, 'error');
      }
      settingsDiscovering.value = false;
    }

    function addDiscoveredAp(ap) {
      settingsAps.value.push({
        id: 'ap-' + ap.ip.split('.').join('-'),
        name: `AP ${ap.ip.split('.')[3]}`,
        ip: ap.ip,
        model: ap.model || 'i27V1.1',
        location: '',
      });
      settingsDiscovered.value = settingsDiscovered.value.filter(a => a.ip !== ap.ip);
      toast(`Added ${ap.ip}`, 'success');
    }

    function addManualSettingsAp() {
      const nap = settingsNewAp.value;
      if (!nap.id || !nap.name || !nap.ip) { toast('Fill in ID, name and IP', 'error'); return; }
      settingsAps.value.push({ ...nap });
      settingsNewAp.value = { id: '', name: '', ip: '', model: 'i27V1.1', location: '' };
      toast('AP added', 'success');
    }

    function removeSettingsAp(index) {
      settingsAps.value.splice(index, 1);
    }

    async function saveSettings() {
      settingsSaving.value = true;
      try {
        const apsToSave = settingsAps.value.map(a => ({
          id: a.id, name: a.name, ip: a.ip, model: a.model || 'i27V1.1', location: a.location || '',
        }));
        await API.post('/api/setup/save', { aps: apsToSave });
        showSettings.value = false;
        toast('Settings saved', 'success');
        await refreshAll();
      } catch (e) {
        toast('Save error: ' + e.message, 'error');
      }
      settingsSaving.value = false;
    }

    // ── AP management ──
    async function refreshAll() {
      loading.value = true;
      try { aps.value = await API.get('/api/aps'); } catch (e) { toast('Error: ' + e.message, 'error'); }
      finally { loading.value = false; }
    }

    async function selectAp(ap) {
      if (ap.enabled === false) return;
      selectedAp.value = ap; snapshot.value = null; editMode.value = false; edits.value = {}; activeTab.value = null;
      view.value = 'dashboard';
      if (ap.online) await loadSnapshot(ap.id);
    }

    async function loadSnapshot(apId) {
      snapshotLoading.value = true; snapshot.value = null;
      try {
        const data = await API.get(`/api/aps/${apId}/snapshot`);
        snapshot.value = data.snapshot;
        const cats = Object.keys(groupedSnapshot.value);
        if (cats.length && !activeTab.value) activeTab.value = cats[0];
      } catch (e) { toast('Config error: ' + e.message, 'error'); }
      finally { snapshotLoading.value = false; }
    }

    function isEditable(moduleName, field) {
      if (READONLY_FIELDS.has(field)) return false;
      if (moduleName === 'wifiRadioGetIndoor') return ['wifiEn', 'channel', 'bandwidth', 'netMode', 'lockChannel', 'lockPower', 'currentPower'].includes(field);
      if (moduleName === 'wifiBasicGetIndoor') return ['ssid', 'ssidEn', 'broadcastSsid', 'maxClientNum', 'staIsolate', 'wmf', 'ssidIsolate', 'ssidEncode'].includes(field);
      if (moduleName === 'apSecurityGet') return ['secType', 'wpapskAuth', 'wpapskPwd'].includes(field);
      return false;
    }

    function getOptions(moduleName, field) { return FIELD_OPTIONS[field] || null; }
    function getEditValue(moduleName, field, original) {
      return (edits.value[moduleName] && edits.value[moduleName][field] !== undefined) ? edits.value[moduleName][field] : original;
    }
    function hasEdit(moduleName, field) { return edits.value[moduleName] && edits.value[moduleName][field] !== undefined; }
    function setEdit(moduleName, field, value) {
      if (!edits.value[moduleName]) edits.value[moduleName] = {};
      edits.value[moduleName][field] = value;
    }
    function enterEditMode() { editMode.value = true; edits.value = {}; }
    function cancelEdit() { editMode.value = false; edits.value = {}; }

    async function saveChanges() {
      if (!selectedAp.value || !snapshot.value) return;
      const moduleEdits = {};
      for (const [moduleName, fields] of Object.entries(edits.value)) {
        const mod = Object.values(snapshot.value).find(m => m.name === moduleName);
        if (!mod) continue;
        const setName = moduleName.replace('GetIndoor', 'SetIndoor').replace('Get', 'Set');
        moduleEdits[setName] = { ...mod.params, ...fields };
      }
      if (Object.keys(moduleEdits).length === 0) { toast('No changes', 'info'); return; }
      saving.value = true;
      for (const [moduleName, params] of Object.entries(moduleEdits)) {
        try { await API.post(`/api/aps/${selectedAp.value.id}/set`, { module: moduleName, params }); toast(`${moduleName} ✅`, 'success'); }
        catch (e) { toast(`${moduleName}: ${e.message}`, 'error'); }
      }
      saving.value = false; editMode.value = false; edits.value = {};
      await loadSnapshot(selectedAp.value.id);
    }

    function shouldShowModule(mod) { return true; }

    function signalClass(signal) {
      const s = parseInt(signal);
      if (s >= -50) return 'signal-great';
      if (s >= -60) return 'signal-good';
      if (s >= -70) return 'signal-ok';
      return 'signal-weak';
    }

    function formatUptime(seconds) {
      const s = parseInt(seconds) || 0;
      const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
      if (d > 0) return `${d}d ${h}h ${m}m`;
      if (h > 0) return `${h}h ${m}m`;
      return `${m}m`;
    }

    async function runCompare() {
      if (!compareLeft.value || !compareRight.value) return;
      if (compareLeft.value === compareRight.value) { toast('Select two different APs', 'error'); return; }
      compareLoading.value = true; compareResult.value = null;
      try { compareResult.value = await API.get(`/api/aps/${compareLeft.value}/compare/${compareRight.value}`); }
      catch (e) { toast('Error: ' + e.message, 'error'); }
      finally { compareLoading.value = false; }
    }

    watch(bulkSource, async (src) => {
      bulkSourceData.value = null; bulkResults.value = null;
      if (!src) return;
      try {
        const data = await API.get(`/api/aps/${src}/snapshot`);
        const snap = data.snapshot;
        const organized = { ssid: {}, sec: {}, radio: {} };
        for (const [key, mod] of Object.entries(snap)) {
          const radio = mod.params && mod.params.radio;
          if (!radio) continue;
          if (key.startsWith('ssid_') && mod.params.ssidIndex === '0') organized.ssid[radio] = mod.data;
          if (key.startsWith('sec_') && mod.params.ssidIndex === '0') organized.sec[radio] = mod.data;
          if (key.startsWith('radio_')) organized.radio[radio] = mod.data;
        }
        bulkSourceData.value = organized;
      } catch (e) { toast('Source error: ' + e.message, 'error'); }
    });

    async function applyBulk() {
      if (bulkTargets.value.length === 0 || !bulkSourceData.value) return;
      bulkSaving.value = true; bulkResults.value = null;
      const results = {};
      for (const apId of bulkTargets.value) {
        if (apId === bulkSource.value) { results[apId] = { success: true, skipped: true }; continue; }
        try {
          for (const radio of ['2.4G', '5G']) {
            const ssid = bulkSourceData.value.ssid[radio];
            const sec = bulkSourceData.value.sec[radio];
            const rad = bulkSourceData.value.radio[radio];
            if (rad) {
              await API.post(`/api/aps/${apId}/set`, { module: 'wifiRadioSetIndoor', params: { radio, wifiEn: rad.wifiEn, channel: rad.channel, bandwidth: rad.bandwidth, netMode: rad.netMode, currentPower: rad.currentPower } });
            }
            if (ssid) {
              await API.post(`/api/aps/${apId}/set`, { module: 'wifiBasicSetIndoor', params: { radio, ssidIndex: '0', ssid: ssid.ssid, ssidEn: ssid.ssidEn, broadcastSsid: ssid.broadcastSsid, maxClientNum: ssid.maxClientNum, staIsolate: ssid.staIsolate, wmf: ssid.wmf, ssidIsolate: ssid.ssidIsolate, ssidEncode: ssid.ssidEncode || 'utf-8' } });
            }
            if (sec) {
              await API.post(`/api/aps/${apId}/set`, { module: 'apSecuritySet', params: { radio, ssidIndex: '0', secType: sec.secType, wpapskAuth: sec.wpapskAuth, wpapskPwd: sec.wpapskPwd } });
            }
          }
          results[apId] = { success: true };
        } catch (e) { results[apId] = { success: false, error: e.message }; }
      }
      bulkResults.value = results; bulkSaving.value = false;
      const ok = Object.values(results).filter(r => r.success).length;
      const err = Object.values(results).filter(r => !r.success).length;
      toast(`Bulk: ${ok} OK${err ? `, ${err} errors` : ''}`, err ? 'error' : 'success');
    }

    function getApName(apId) { const ap = aps.value.find(a => a.id === apId); return ap ? ap.name : apId; }
    function isPassword(f) { return PASSWORD_FIELDS.has(f); }

    async function cleanupSsids() {
      const targets = onlineAps.value.map(a => a.id);
      if (targets.length === 0) { toast('No APs online', 'error'); return; }
      cleaning.value = true; cleanupResults.value = null;
      try {
        const data = await API.post('/api/cleanup/ssids', { targets });
        cleanupResults.value = data.results;
        const ok = Object.values(data.results).filter(r => r.success).length;
        const err = Object.values(data.results).filter(r => !r.success).length;
        toast(`Cleanup: ${ok} OK${err ? `, ${err} errors` : ''}`, err ? 'error' : 'success');
      } catch (e) {
        toast('Cleanup error: ' + e.message, 'error');
      } finally {
        cleaning.value = false;
      }
    }

    function startReboot() {
      if (rebootTargets.value.length === 0) return;
      rebootResults.value = null;
      rebootModal.value = true;
    }

    async function confirmReboot() {
      rebooting.value = true; rebootResults.value = null;
      try {
        const data = await API.post('/api/reboot', { targets: rebootTargets.value });
        rebootResults.value = data.results;
        toast('Reboot started', 'success');
      } catch (e) { toast('Reboot error: ' + e.message, 'error'); }
      finally { rebooting.value = false; }
    }

    async function applyUplink() {
      uplinkSaving.value = true; uplinkResults.value = null;
      const results = {};
      for (const apId of uplinkTargets.value) {
        try {
          await API.post(`/api/aps/${apId}/uplink`, { enable: true, ...uplinkConfig.value });
          results[apId] = { success: true };
        } catch (e) { results[apId] = { success: false, error: e.message }; }
      }
      uplinkResults.value = results; uplinkSaving.value = false;
      const ok = Object.values(results).filter(r => r.success).length;
      toast(`Uplink enabled on ${ok} AP(s)`, 'success');
    }

    function formatValue(val) {
      if (val === null || val === undefined) return '—';
      if (typeof val === 'boolean') return val ? '✓ Yes' : '✗ No';
      if (Array.isArray(val)) return val.join(', ');
      if (typeof val === 'object') return JSON.stringify(val);
      return String(val);
    }
    function categoryLabel(cat) { return CATEGORY_LABELS[cat] || cat; }

    // ── Firmware functions ──
    async function loadFirmwareInfo() {
      fwLoading.value = true;
      const results = [];
      for (const ap of aps.value) {
        if (ap.enabled === false) continue;
        try {
          const data = await API.get(`/api/aps/${ap.id}/firmware`);
          results.push({ ...data, online: ap.online });
        } catch (e) {
          results.push({ id: ap.id, name: ap.name, ip: ap.ip, model: ap.model, online: ap.online, firmware: null, firmwareDate: null, error: e.message });
        }
      }
      fwInfo.value = results;
      fwLoading.value = false;
    }

    async function checkAllOnline() {
      fwOnlineCheck.value = true;
      for (let i = 0; i < fwInfo.value.length; i++) {
        const f = fwInfo.value[i];
        if (!f.online) continue;
        fwInfo.value[i] = { ...f, onlineCheckStatus: 0 };
      }
      for (let i = 0; i < fwInfo.value.length; i++) {
        const f = fwInfo.value[i];
        if (!f.online) continue;
        try {
          const data = await API.get(`/api/aps/${f.id}/firmware/check`);
          fwInfo.value[i] = { ...fwInfo.value[i], onlineCheckStatus: data.status, onlineNewVersion: data.newVersion, onlineDescription: data.description };
        } catch (e) {
          fwInfo.value[i] = { ...fwInfo.value[i], onlineCheckStatus: 5 };
        }
        await new Promise(r => setTimeout(r, 1000));
      }
      fwOnlineCheck.value = false;
    }

    async function uploadSingleFirmware(apId, event) {
      const file = event.target.files[0];
      if (!file) return;
      if (!confirm(`Upload ${file.name} to ${getApName(apId)}? The AP will reboot (~3 min).`)) {
        event.target.value = '';
        return;
      }
      const formData = new FormData();
      formData.append('firmware', file);
      try {
        const res = await fetch(`/api/aps/${apId}/firmware/upload`, { method: 'POST', body: formData });
        const data = await res.json();
        if (data.success) toast(`✅ ${getApName(apId)}: ${data.message}`, 'success');
        else toast(`❌ ${getApName(apId)}: ${data.message}`, 'error');
      } catch (e) {
        toast(`❌ ${getApName(apId)}: ${e.message}`, 'error');
      }
      event.target.value = '';
    }

    async function uploadBatchFirmware(event) {
      const file = event.target.files[0];
      if (!file) return;
      if (!confirm(`Upload ${file.name} to ${fwBatchTargets.value.length} AP(s)? APs will reboot one at a time.`)) {
        event.target.value = '';
        return;
      }
      fwBatchUploading.value = true; fwBatchResults.value = null;
      const formData = new FormData();
      formData.append('firmware', file);
      formData.append('targets', JSON.stringify(fwBatchTargets.value));
      try {
        const res = await fetch('/api/firmware/batch-upload', { method: 'POST', body: formData });
        const data = await res.json();
        fwBatchResults.value = data.results;
        const ok = Object.values(data.results).filter(r => r.success).length;
        const err = Object.values(data.results).filter(r => !r.success).length;
        toast(`Batch: ${ok} OK${err ? `, ${err} errors` : ''}`, err ? 'error' : 'success');
      } catch (e) {
        toast('Batch error: ' + e.message, 'error');
      }
      fwBatchUploading.value = false;
      event.target.value = '';
    }

    async function startOnlineUpgrade(apId) {
      if (!confirm(`Start online upgrade for ${getApName(apId)}? The AP will download and install new firmware.`)) return;
      const idx = fwInfo.value.findIndex(f => f.id === apId);
      if (idx >= 0) fwInfo.value[idx] = { ...fwInfo.value[idx], upgrading: true };
      try {
        await API.post(`/api/aps/${apId}/firmware/online-upgrade`, {});
        toast(`${getApName(apId)}: download started`, 'success');
      } catch (e) {
        toast(`${getApName(apId)}: ${e.message}`, 'error');
      }
      if (idx >= 0) fwInfo.value[idx] = { ...fwInfo.value[idx], upgrading: false };
    }

    onMounted(async () => {
      await checkSetup();
      if (!setupNeeded.value) await refreshAll();
    });

    return {
      // Core
      aps, loading, view, selectedAp, snapshot, snapshotLoading, editMode, edits, saving, activeTab,
      compareLeft, compareRight, compareResult, compareLoading,
      bulkTargets, bulkSource, bulkSourceData, bulkSaving, bulkResults,
      toasts, onlineCount, onlineAps, groupedSnapshot, snapshotCategories, filteredSnapshot, totalClients,
      refreshAll, selectAp, loadSnapshot, enterEditMode, cancelEdit, saveChanges,
      isEditable, getOptions, getEditValue, hasEdit, setEdit, shouldShowModule,
      signalClass, formatUptime,
      runCompare, applyBulk, getApName, cleanupSsids, cleaning, cleanupResults,
      startReboot, confirmReboot, rebootTargets, rebootModal, rebooting, rebootResults,
      applyUplink, uplinkTargets, uplinkSaving, uplinkResults, uplinkConfig,
      isPassword, formatValue, categoryLabel,
      // Firmware
      fwInfo, fwLoading, fwOnlineCheck, fwBatchTargets, fwBatchUploading, fwBatchResults,
      loadFirmwareInfo, checkAllOnline, uploadSingleFirmware, uploadBatchFirmware, startOnlineUpgrade,
      // Setup Wizard
      setupNeeded, setupStep, setupSubnet, setupDiscovering, setupDiscovered,
      setupPassword, setupSelectedAps, setupTesting, setupTestResults, setupSaving,
      runDiscovery, testSetupConnections, saveSetup, addManualAp, removeSetupAp,
      // Settings
      showSettings, settingsAps, settingsPassword, settingsSaving,
      settingsAdding, settingsNewAp, settingsDiscovering, settingsDiscovered,
      openSettings, settingsDiscover, addDiscoveredAp, addManualSettingsAp, removeSettingsAp, saveSettings,
    };
  },
}).mount('#app');
