/**
 * Tenda AP Panel — Vue 3 SPA
 * Tab-based editor with schema-driven forms, tabular editors, password-protected ops.
 */
const { createApp, ref, reactive, computed, watch, onMounted, onUnmounted, nextTick } = Vue;

const API = {
  async _fetch(url, options, timeoutMs) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs || 60000);
    try {
      const r = await fetch(url, { ...options, signal: ctrl.signal });
      clearTimeout(t);
      if (!r.ok) throw new Error(`${r.status}`);
      return r;
    } catch (e) {
      clearTimeout(t);
      throw e.name === 'AbortError' ? new Error('Timeout — AP non risponde') : e;
    }
  },
  async get(url, opts) {
    const maxRetries = opts?.retries ?? 1;
    let lastErr;
    for (let i = 0; i <= maxRetries; i++) {
      try {
        const r = await API._fetch(url, { method: 'GET' }, opts?.timeout);
        return r.json();
      } catch (e) {
        lastErr = e;
        if (i < maxRetries) await new Promise(r => setTimeout(r, 500 * (i + 1)));
      }
    }
    throw lastErr;
  },
  async post(url, body, opts) {
    const maxRetries = opts?.retries ?? 1;
    let lastErr;
    for (let i = 0; i <= maxRetries; i++) {
      try {
        const r = await API._fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }, opts?.timeout);
        return r.json();
      } catch (e) {
        lastErr = e;
        // Don't retry on 4xx client errors
        if (e.message?.match(/^4\d\d$/)) throw e;
        if (i < maxRetries) await new Promise(r => setTimeout(r, 500 * (i + 1)));
      }
    }
    throw lastErr;
  },
};

createApp({
  template: '#app-tmpl',
  setup() {
    // ── State ──
    const aps = ref([]);
    const selApId = ref(null);
    const selTab = ref('status');
    const mainView = ref('dashboard');
    const loading = ref(false);
    const error = ref('');
    const msg = ref('');
    const snapshot = ref(null);
    const fieldDefs = ref(null);
    const editorVals = reactive({});
    const tabEditorVals = reactive({});
    const passwordModal = reactive({ show: false, pwd: '', moduleKey: '' });
    const editingRow = reactive({ table: null, apId: null });
    const pollingId = ref(null);
    const rebootModal = ref(false);
    const compareSel1 = ref('');
    const compareSel2 = ref('');
    const comparing = ref(false);
    const compareData = ref(null);

    // Bulk edit
    const bulkTargets = ref([]);
    const bulkSource = ref('');
    const bulkSourceData = ref(null);
    const bulkSaving = ref(false);
    const bulkResults = ref(null);
    // Cleanup
    const cleaning = ref(false);
    const cleanupResults = ref(null);
    // Reboot
    const rebootTargets = ref([]);
    const rebooting = ref(false);
    const rebootResults = ref(null);
    const saving = ref({});
    const saveErrors = ref({});
    const sidebarOpen = ref(false);
    // Uplink
    const uplinkTargets = ref([]);
    const uplinkSaving = ref(false);
    const uplinkResults = ref(null);
    const uplinkConfig = reactive({ hostIp1: '192.168.0.5', hostIp2: '8.8.8.8', timeInterval: '10' });
    // Firmware
    const fwInfo = ref([]);
    const fwLoading = ref(false);
    const fwOnlineCheck = ref(false);
    const fwBatchTargets = ref([]);
    const fwBatchUploading = ref(false);
    const fwBatchResults = ref(null);
    const fwFile = ref(null);
    const fwFileInput = ref(null);
    // Compare
    const compareLeft = ref('');
    const compareRight = ref('');
    const compareLoading = ref(false);
    const compareResult = ref(null);

    const selAp = computed(() => aps.value.find(a => a.id === selApId.value) || null);
    const selModel = computed(() => selAp.value?.model || 'i27V1.1');
    const tabs = computed(() => fieldDefs.value?.tabs || {});
    const currentTab = computed(() => tabs.value[selTab.value] || { modules: [] });

    // ── Setup Wizard state ──
    const setupNeeded = ref(false);
    const setupStep = ref(1);
    const setupSubnet = ref('192.168.0');
    const setupDiscovering = ref(false);
    const setupDiscovered = ref([]);
    const setupPassword = ref('');
    const setupSelectedAps = ref([]);
    const setupTesting = ref(false);
    const setupTestResults = ref({});
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

    // ── Helpers ──
    const clearMsg = () => { msg.value = ''; error.value = ''; };
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const onlineAps = computed(() => aps.value.filter(a => a.online));
    const onlineCount = computed(() => onlineAps.value.length);
    const getApName = (id) => aps.value.find(a => a.id === id)?.name || id;

    function signalClass(v) {
      const n = Number(v);
      if (isNaN(n)) return '';
      if (n >= -60) return 'sig-great';
      if (n >= -70) return 'sig-good';
      if (n >= -75) return 'sig-ok';
      if (n >= -85) return 'sig-weak';
      return 'sig-critical';
    }

    // Normalize client signal across firmware versions:
    // New firmware: cl.signal = "-62"
    // Old firmware: cl.signNoise = "-78/-84dBm" (rssi/noise)
    function clientSignal(cl) {
      if (cl.signal != null && cl.signal !== '') return cl.signal;
      if (cl.signNoise) {
        // Extract first number from "-78/-84dBm"
        const m = cl.signNoise.match(/(-?\d+)/);
        return m ? m[1] : '';
      }
      return '';
    }

    // ── Data loading ──
    async function loadAPs() {
      try {
        aps.value = await API.get('/api/aps');
        if (!selApId.value && aps.value.length) selApId.value = aps.value[0].id;
      } catch (e) { error.value = 'Errore caricamento AP: ' + e.message; }
    }

    async function loadFieldDefs() {
      try {
        fieldDefs.value = await API.get(`/api/fields/${encodeURIComponent(selModel.value)}`);
      } catch (e) { /* non bloccante */ }
    }

    async function loadSnapshot(id) {
      loading.value = true; clearMsg();
      try {
        snapshot.value = await API.get(`/api/aps/${id}/snapshot`);
        initEditorVals();
      } catch (e) { error.value = e.message; }
      loading.value = false;
    }

    async function refreshAll() {
      await loadAPs();
      if (selApId.value) await loadSnapshot(selApId.value);
    }

    // ── Editor values ──
    function initEditorVals() {
      for (const k of Object.keys(editorVals)) delete editorVals[k];
      for (const k of Object.keys(tabEditorVals)) delete tabEditorVals[k];
      if (!snapshot.value) return;
      for (const [key, val] of Object.entries(snapshot.value.snapshot || {})) {
        const data = val?.data !== undefined ? JSON.parse(JSON.stringify(val.data)) : null;
        editorVals[key] = data;
        // Also index by module name (snap key ≠ module name used in template)
        const name = val?.name;
        if (!name) continue;
        editorVals[name] = data;
        // Per-radio modules: e.g. radio_24g → wifiRadioGetIndoor.2.4G
        const radio = val?.params?.radio;
        if (radio) {
          const rSuffix = radio === '5G' ? '5G' : '2.4G';
          editorVals[name + '.' + rSuffix] = data;
          // Per-SSID modules: e.g. ssid_24g_3 → wifiBasicGetIndoor.2.4G.3
          const si = val?.params?.ssidIndex;
          if (si !== undefined && si !== '') editorVals[name + '.' + rSuffix + '.' + si] = data;
        }
      }
    }

    function getModuleData(moduleName) {
      const snap = snapshot.value?.snapshot || {};
      // Direct snapshot key lookup (e.g. 'clients_24g')
      if (snap[moduleName]?.data !== undefined) return snap[moduleName].data;
      // Match by module 'name' field (e.g. 'wifiRadioGetIndoor')
      for (const [k, v] of Object.entries(snap)) {
        if (v.name === moduleName) return v.data;
      }
      // Match by module 'key' field (e.g. 'clients_24g')
      for (const [k, v] of Object.entries(snap)) {
        if (v.key === moduleName) return v.data;
      }
      return null;
    }

    function findSnapshotKey(moduleName) {
      for (const [k, v] of Object.entries(snapshot.value?.snapshot || {})) {
        if (v.name === moduleName) return k;
      }
      return null;
    }

    // Parse EDCA string
    function parseEdca(str) { const p = (str || '').split(' '); return { cwmin: Number(p[0]) || 0, cwmax: Number(p[1]) || 0, aifs: Number(p[2]) || 0, txop: Number(p[3]) || 0 }; }
    function formatEdca(obj) { return `${obj.cwmin || 0} ${obj.cwmax || 0} ${obj.aifs || 0} ${obj.txop || 0}`; }

    // ── Save ──
    async function saveModule(moduleKey, password) {
      const def = fieldDefs.value?.fields?.[moduleKey];
      if (!def || !def.setter) return;
      clearMsg();
      saving.value[moduleKey] = true;
      saveErrors.value[moduleKey] = '';

      try {
        const vals = editorVals[moduleKey] || {};
        const params = {};

        // Copy identity params
        if (def.radio) params.radio = def.radio;
        if (def.ssidIndex) params.ssidIndex = def.ssidIndex;

        // Copy editable fields
        if (def.fields) {
          for (const [fkey, fdef] of Object.entries(def.fields)) {
            if (fdef.readonly) continue;
            if (vals.hasOwnProperty(fkey)) params[fkey] = vals[fkey];
          }
        }

        // Handle tabular data
        if (def.tabular && def.tables) {
          for (const [tkey, tdef] of Object.entries(def.tables)) {
            if (tdef.edcaKeys) {
              // EDCA: array of objects back to named strings
              const arrVals = editorVals[`${moduleKey}.${tkey}`] || [];
              const acs = ['BE', 'BK', 'VI', 'VO'];
              for (let i = 0; i < 4; i++) {
                if (arrVals[i]) params[acs[i]] = formatEdca(arrVals[i]);
              }
            } else if (tkey === 'macList') {
              const macs = (editorVals[`${moduleKey}.${tkey}`] || []).filter(m => m?.mac);
              if (macs.length) params[tkey] = macs;
            }
          }
        }

        if (password) params._password = password;
        const resp = await API.post(`/api/aps/${selApId.value}/set`, { module: def.setter, params });
        msg.value = `${def.label} — salvato ✓`;
        await sleep(2000);
        await loadSnapshot(selApId.value);
      } catch (e) {
        saveErrors.value[moduleKey] = e.message;
      }
      saving.value[moduleKey] = false;
    }

    // Password modal
    function requestPassword(moduleKey) {
      passwordModal.moduleKey = moduleKey;
      passwordModal.pwd = '';
      passwordModal.show = true;
    }
    function confirmPassword() {
      const pwd = passwordModal.pwd;
      passwordModal.show = false;
      if (pwd) saveModule(passwordModal.moduleKey, pwd);
    }
    function cancelPassword() { passwordModal.show = false; }

    // ── Field helpers ──
    function getFieldValue(fkey, fieldDef, data) {
      if (!data) return '';
      return data[fkey] !== undefined ? data[fkey] : fieldDef?.default || '';
    }

    function isShown(fkey, fieldDef, data) {
      if (!fieldDef?.showIf || !data) return true;
      for (const [depField, depValues] of Object.entries(fieldDef.showIf)) {
        if (!depValues.includes(data[depField])) return false;
      }
      return true;
    }

    // ── Tabular editor helpers ──
    function getTableRow(tkey, idx) {
      const key = `${editingRow.table}.${tkey}`;
      const rows = editorVals[key] || [];
      return rows[idx] || {};
    }
    function setTableCell(tkey, idx, colKey, val) {
      const key = `${editingRow.table}.${tkey}`;
      if (!editorVals[key]) editorVals[key] = [];
      if (!editorVals[key][idx]) editorVals[key][idx] = {};
      editorVals[key][idx][colKey] = val;
    }
    function addMacRow(tableKey) {
      const key = `${tableKey}.macList`;
      if (!editorVals[key]) editorVals[key] = [];
      const mac = prompt('Nuovo MAC (es. AA:BB:CC:DD:EE:FF):');
      if (mac && /^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/.test(mac)) {
        editorVals[key].push({ mac: mac.toUpperCase() });
        editorVals[key] = [...editorVals[key]]; // trigger reactivity
      }
    }
    function removeMacRow(tableKey, idx) {
      const key = `${tableKey}.macList`;
      if (!editorVals[key]) return;
      editorVals[key].splice(idx, 1);
      editorVals[key] = [...editorVals[key]];
    }

    // ── Schedule editor helpers ──
    function toggleScheduleSlot(ssidIdx, slotIdx) {
      const key = `wifiScheduledGet.schedules`;
      const rows = editorVals[key] || [];
      const row = rows[ssidIdx] || {};
      const list = row.scheduledList || [];
      if (!list[slotIdx]) list[slotIdx] = { time: '00:00-00:00', date: '' };
      if (list[slotIdx].time === '00:00-00:00') list[slotIdx].time = '';
      else list[slotIdx].time = '00:00-00:00';
      row.scheduledList = [...list];
      editorVals[key] = [...rows];
    }
    function setScheduleTime(ssidIdx, slotIdx, val) {
      const key = `wifiScheduledGet.schedules`;
      const rows = [...(editorVals[key] || [])];
      const row = { ...(rows[ssidIdx] || {}) };
      const list = [...(row.scheduledList || [])];
      if (!list[slotIdx]) list[slotIdx] = { time: '', date: '' };
      list[slotIdx] = { ...list[slotIdx], time: val };
      row.scheduledList = list;
      rows[ssidIdx] = row;
      editorVals[key] = rows;
    }

    // ── EDCA helpers ──
    function initEdcaVals(moduleKey, tableKey) {
      const mData = getModuleData(moduleKey);
      const tkey = `${moduleKey}.${tableKey}`;
      // Standard 4 ACs: BE, BK, VI, VO
      const acs = ['BE', 'BK', 'VI', 'VO'];
      if (!editorVals[tkey]) editorVals[tkey] = [];
      const edcaData = mData?.[tableKey] || {};
      for (let i = 0; i < 4; i++) {
        const ac = acs[i];
        const str = edcaData[ac] || '0 0 0 0';
        editorVals[tkey][i] = parseEdca(str);
      }
      return editorVals[tkey];
    }

    // ── Compare ──
    async function loadCompare() {
      comparing.value = true;
      try {
        compareData.value = await API.get(`/api/aps/${compareSel1.value}/compare/${compareSel2.value}`);
      } catch (e) { error.value = e.message; }
      comparing.value = false;
    }
    async function runCompare() {
      comparing.value = true; compareResult.value = null;
      try {
        compareResult.value = await API.get(`/api/aps/${compareLeft.value}/compare/${compareRight.value}`);
      } catch(e) { error.value = e.message; }
      comparing.value = false;
    }

    // ── Reboot ──
    function startReboot() {
      if (!rebootTargets.value.length) return;
      const names = rebootTargets.value.map(id => getApName(id)).join(', ');
      if (!confirm(`Confermi il riavvio di: ${names}?\nGli AP saranno offline per 30-60 secondi.`)) return;
      confirmReboot();
    }

    async function confirmReboot() {
      rebooting.value = true;
      rebootResults.value = null;
      msg.value = '';
      error.value = '';
      try {
        const r = await API.post('/api/reboot', { targets: rebootTargets.value });
        rebootResults.value = r.results || {};
        const ok = Object.values(r.results || {}).filter(v => v.success).length;
        const fail = Object.values(r.results || {}).filter(v => !v.success).length;
        if (fail > 0) {
          error.value = `Reboot: ${ok} OK, ${fail} falliti`;
        } else {
          msg.value = `✅ ${ok} AP riavviato/i. Torneranno online in 30-60s`;
        }
      } catch(e) {
        error.value = 'Errore reboot: ' + e.message;
      }
      rebooting.value = false;
      setTimeout(() => loadAPs(), 5000);
    }

    // ── Cleanup SSIDs ──
    async function cleanupSsids() {
      if (!confirm('Disabilitare SSID #2-#8 su TUTTI gli AP online?')) return;
      cleaning.value = true; cleanupResults.value = null;
      try {
        const r = await API.post('/api/cleanup/ssids', { targets: onlineAps.value.map(a => a.id) });
        cleanupResults.value = r.results;
        msg.value = 'Pulizia completata ✓';
      } catch(e) { error.value = e.message; }
      cleaning.value = false;
    }

    // ── Bulk Sync ──
    async function bulkSync() {
      if (!confirm('Sincronizzare config su TUTTI gli AP dello stesso modello?')) return;
      loading.value = true; clearMsg();
      const srcSnap = snapshot.value?.snapshot;
      const targetAps = aps.value.filter(a => a.id !== selApId.value && a.model === selModel.value && a.enabled !== false);
      const results = [];
      for (const ap of targetAps) {
        try {
          for (const [key, mod] of Object.entries(srcSnap || {})) {
            if (!mod.data || ['wifiClientList','lanStatus','wifiWorkMode','systemStatusGet'].includes(mod.name)) continue;
            await API.post(`/api/aps/${ap.id}/set`, { module: mod.name.replace('Get','Set'), params: mod.data });
          }
          results.push(`${ap.name}: ✓`);
        } catch(e) { results.push(`${ap.name}: ✗`); }
      }
      msg.value = 'Sync: ' + results.join(', ');
      loading.value = false;
    }

    // ── Bulk Apply with categorized module selection ──
    const showBulkModal = ref(false);
    const bulkModules = ref([]);
    const bulkGroups = computed(() => {
      const cats = { wifi: [], radio: [], vlan: [], qos: [], net: [], adv: [] };
      const catLabels = { wifi: '📶 SSID & WiFi', radio: '📻 Canali e potenza', vlan: '🔀 VLAN', qos: '📊 QoS / Limiti', net: '🌐 Rete / LAN', adv: '⚙️ Altro' };
      for (const m of bulkModules.value) {
        let c = 'adv';
        if (m.name.startsWith('wifiBasic') || m.name.startsWith('apSecurity')) c = 'wifi';
        else if (m.name.startsWith('wifiRadio')) c = 'radio';
        else if (m.name.startsWith('qvlan')) c = 'vlan';
        else if (m.name.startsWith('qos')) c = 'qos';
        else if (m.name.startsWith('lan')) c = 'net';
        cats[c].push(m);
      }
      return Object.entries(cats).filter(([, items]) => items.length).map(([cat, items]) => ({ cat, label: catLabels[cat], items }));
    });
    const bulkSelectedCount = computed(() => bulkModules.value.filter(m => m.checked).length);

    const UNIQUE_MODULES = ['lanManageCfgGet', 'lanStatus', 'systemStatusGet', 'sysTimeInfoGet'];

    async function onBulkSourceChange() {
      if (!bulkSource.value) { bulkModules.value = []; return; }
      try {
        const snap = await API.get(`/api/aps/${bulkSource.value}/snapshot`);
        const mods = [];
        for (const [key, mod] of Object.entries(snap.snapshot || {})) {
          if (!mod.data) continue;
          const name = mod.name || '';
          const isUnique = UNIQUE_MODULES.includes(key) || UNIQUE_MODULES.includes(name);
          // Build human-readable description
          let desc = mod.label || name || key;
          if (key.includes('ssid_')) desc = `SSID ${mod.label || key}`;
          else if (name === 'wifiRadioGetIndoor') desc = `Radio ${mod.params?.radio || key}`;
          else if (name === 'wifiBasicGetIndoor') desc = `WiFi di rete (SSID #${(parseInt(mod.params?.ssidIndex)||0)+1}) ${mod.params?.radio||''}`;
          else if (name === 'apSecurityGet') desc = `Password WiFi (SSID #${(parseInt(mod.params?.ssidIndex)||0)+1}) ${mod.params?.radio||''}`;
          else if (name === 'wifiAdvanceGetIndoor') desc = `Avanzate WiFi ${mod.params?.radio||''}`;
          else if (name === 'wifiMacFilterGet') desc = `Filtro MAC ${mod.params?.radio||''}`;
          else if (name === 'apSteerdRssiGet') desc = 'Roaming / RSSI minimo';
          else if (name === 'wifiFastRoamingGet') desc = 'Fast Roaming (802.11r)';
          else if (name === 'wifiScheduledGet') desc = 'Orari WiFi';
          else if (name === 'apLoadBalanceGet') desc = 'Bilanciamento carico';
          else if (name === 'broadcastFilterGet') desc = 'Filtro broadcast';
          else if (name === 'lanManageCfgGet') desc = 'Configurazione IP LAN';
          else if (name === 'qvlanGet') desc = 'Configurazione VLAN';
          else if (name === 'qosManageGet') desc = 'QoS / Traffic Control';
          mods.push({ key, name, label: mod.label || '', desc, unique: isUnique, checked: !isUnique, data: mod.data });
        }
        mods.sort((a, b) => a.unique - b.unique || a.desc.localeCompare(b.desc));
        bulkModules.value = mods;
        bulkSourceData.value = snap.snapshot;
      } catch (e) { error.value = 'Errore caricamento sorgente: ' + e.message; }
    }

    function checkAllBulk(v) { for (const m of bulkModules.value) if (!m.unique) m.checked = v; }

    async function applyBulkSelected() {
      const selected = bulkModules.value.filter(m => m.checked);
      if (!selected.length) { error.value = 'Nessuna impostazione selezionata'; return; }
      bulkSaving.value = true; bulkResults.value = null;
      const results = {};
      for (const id of bulkTargets.value) {
        try {
          for (const mod of selected) {
            const setter = mod.name.replace('Get', 'Set');
            if (!setter || setter === mod.name) continue;
            const params = { ...mod.data };
            const snapMod = bulkSourceData.value?.[mod.key];
            if (snapMod?.params) {
              if (snapMod.params.radio) params.radio = snapMod.params.radio;
              if (snapMod.params.ssidIndex !== undefined && snapMod.params.ssidIndex !== '') params.ssidIndex = snapMod.params.ssidIndex;
            }
            await API.post(`/api/aps/${id}/set`, { module: setter, params });
          }
          results[id] = { success: true };
        } catch(e) { results[id] = { success: false, error: e.message }; }
      }
      bulkResults.value = results;
      bulkSaving.value = false;
    }

    // ── Uplink ──
    async function applyUplink() {
      uplinkSaving.value = true; uplinkResults.value = null;
      const results = {};
      for (const id of uplinkTargets.value) {
        try {
          await API.post(`/api/aps/${id}/set`, { module: 'sysUplinkCheckSet', params: { enable: true, ...uplinkConfig } });
          results[id] = { success: true };
        } catch(e) { results[id] = { success: false, error: e.message }; }
      }
      uplinkResults.value = results;
      uplinkSaving.value = false;
    }

    // ── Firmware ──
    async function loadFirmwareInfo() { fwLoading.value = true; try { fwInfo.value = await API.get('/api/firmware'); } catch {} fwLoading.value = false; }

    function onFwFileSelected(evt) { fwFile.value = evt.target.files?.[0] || null; }

    async function uploadBatchFirmware() {
      if (!fwFile.value || !fwBatchTargets.value.length) return;
      fwBatchUploading.value = true; fwBatchResults.value = null;
      try {
        const form = new FormData();
        form.append('firmware', fwFile.value);
        form.append('targets', JSON.stringify(fwBatchTargets.value));
        const r = await fetch('/api/firmware/batch-upload', { method: 'POST', body: form });
        fwBatchResults.value = await r.json();
      } catch (e) { fwBatchResults.value = { _error: { success: false, error: e.message } }; }
      fwBatchUploading.value = false;
    }

    async function startOnlineUpgrade(id) {
      const f = fwInfo.value.find(x => x.id === id);
      if (!f) return;
      f.upgrading = true;
      try {
        const r = await API.post(`/api/aps/${id}/firmware/online-upgrade`);
        f.upgradeDone = true;
        msg.value = `${getApName(id)}: download avviato — riavvierà da solo`;
      } catch (e) { error.value = 'Upgrade fallito: ' + e.message; }
      f.upgrading = false;
    }

    const lastOnlineCheck = ref('');
    async function checkOnlineAll() {
      fwOnlineCheck.value = true;
      for (const f of fwInfo.value) {
        f.onlineStatus = null;
        try {
          const r = await API.get(`/api/aps/${f.id}/firmware/check`);
          f.onlineStatus = r.status;
          f.newVersion = r.newVersion;
          f.description = r.description;
        } catch (e) { f.onlineStatus = 5; }
      }
      lastOnlineCheck.value = new Date().toLocaleTimeString('it-IT');
      fwOnlineCheck.value = false;
    }

    // ── Save VLAN table ──
    async function saveVlanTable() {
      const def = fieldDefs.value?.fields?.qvlanGet;
      if (!def?.setter) return;
      clearMsg();
      const params = {};
      for (const [fkey, fdef] of Object.entries(def.fields || {})) {
        const v = editorVals['qvlanGet'];
        if (v && v.hasOwnProperty(fkey)) params[fkey] = v[fkey];
      }
      for (const [tkey] of Object.entries(def.tables || {})) {
        const rows = editorVals[`qvlanGet.${tkey}`] || [];
        params[tkey] = rows;
      }
      try {
        await API.post(`/api/aps/${selApId.value}/set`, { module: def.setter, params });
        msg.value = 'VLAN salvata ✓';
        await sleep(1500);
        await loadSnapshot(selApId.value);
      } catch (e) { error.value = e.message; }
    }

    // ── Save QoS table ──
    async function saveQosTable() {
      const def = fieldDefs.value?.fields?.qosManageGet;
      if (!def?.setter) return;
      clearMsg();
      const params = {};
      const v = editorVals['qosManageGet'] || {};
      for (const [fkey, fdef] of Object.entries(def.fields || {})) {
        if (v.hasOwnProperty(fkey)) params[fkey] = v[fkey];
      }
      for (const [tkey] of Object.entries(def.tables || {})) {
        const rows = editorVals[`qosManageGet.${tkey}`] || [];
        params[tkey] = rows;
      }
      // Need to send as array keyed by radio
      try {
        await API.post(`/api/aps/${selApId.value}/set`, { module: def.setter, params });
        msg.value = 'Traffic Control salvato ✓';
        await sleep(1500);
        await loadSnapshot(selApId.value);
      } catch (e) { error.value = e.message; }
    }

    // ── Bulk sync ──
    async function bulkSyncAll() {
      bulkSync();
    }

    // ── MQTT Status (for dashboard summary) ──
    const mqttStatus = ref({});
    async function loadMqttStatus() {
      try {
        mqttStatus.value = await API.get('/api/status/mqtt', { retries: 0 });
      } catch {}
    }

    // ── Dashboard summary computed ──
    const dashboardSummary = computed(() => {
      const total = aps.value.length;
      const online = aps.value.filter(a => a.online).length;
      const offline = total - online;
      const totalClients = Object.values(mqttStatus.value).reduce((sum, s) => sum + (s.clients_24g || 0) + (s.clients_5g || 0), 0);
      return { total, online, offline, totalClients };
    });

    const offlineAps = computed(() => aps.value.filter(a => !a.online && a.enabled !== false));

    // ── Lifecycle ──
    watch(selApId, async (id) => {
      if (id) { await loadFieldDefs(); await loadSnapshot(id); }
    });

    let overviewTimer = null;

    // ── Setup Wizard functions ──
    async function checkSetup() {
      try {
        const data = await API.get('/api/setup/status');
        setupNeeded.value = !data.setupComplete;
        if (setupNeeded.value) mainView.value = 'setup';
      } catch { /* ignore */ }
    }

    async function runDiscovery() {
      setupDiscovering.value = true;
      setupDiscovered.value = [];
      try {
        const data = await API.post('/api/setup/discover', { subnet: setupSubnet.value });
        setupDiscovered.value = data.found;
        if (data.found.length === 0) {
          toast('No Tenda APs found on this subnet', 'error');
        } else {
          setupSelectedAps.value = data.found.map(a => ({ ...a, selected: true, name: `AP ${a.ip.split('.')[3]}` }));
        }
      } catch (e) { toast('Discovery error: ' + e.message, 'error'); }
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
          if (result.success) ap.model = result.model;
        } catch (e) { setupTestResults.value[ap.ip] = { success: false, error: e.message }; }
      }
      setupTesting.value = false;
    }

    async function saveSetup() {
      setupSaving.value = true;
      const apsToSave = setupSelectedAps.value.filter(a => a.selected).map(a => ({
        id: 'ap-' + a.ip.split('.').join('-'),
        name: a.name || `AP ${a.ip.split('.')[3]}`,
        ip: a.ip, model: a.model || 'i27V1.1', location: a.location || '',
      }));
      if (!apsToSave.length) { toast('Select at least one AP', 'error'); setupSaving.value = false; return; }
      try {
        await API.post('/api/setup/save', { aps: apsToSave });
        setupStep.value = 3;
        setupNeeded.value = false;
        toast('Setup complete!', 'success');
        await refreshAll();
        mainView.value = 'dashboard';
      } catch (e) { toast('Save error: ' + e.message, 'error'); }
      setupSaving.value = false;
    }

    function addManualAp() {
      setupSelectedAps.value.push({ ip: '', name: '', model: 'i27V1.1', selected: true, manual: true });
    }
    function removeSetupAp(index) { setupSelectedAps.value.splice(index, 1); }

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
        const firstIp = settingsAps.value.length > 0 ? settingsAps.value[0].ip : '192.168.0.1';
        const subnet = firstIp.split('.').slice(0, 3).join('.');
        const data = await API.post('/api/setup/discover', { subnet });
        const existingIps = new Set(settingsAps.value.map(a => a.ip));
        settingsDiscovered.value = data.found.filter(a => !existingIps.has(a.ip));
      } catch (e) { toast('Discovery error: ' + e.message, 'error'); }
      settingsDiscovering.value = false;
    }

    function addDiscoveredAp(ap) {
      settingsAps.value.push({ id: 'ap-' + ap.ip.split('.').join('-'), name: `AP ${ap.ip.split('.')[3]}`, ip: ap.ip, model: ap.model || 'i27V1.1', location: '' });
      settingsDiscovered.value = settingsDiscovered.value.filter(a => a.ip !== ap.ip);
    }

    function addManualSettingsAp() {
      const nap = settingsNewAp.value;
      if (!nap.id || !nap.name || !nap.ip) { toast('Fill in ID, name and IP', 'error'); return; }
      settingsAps.value.push({ ...nap });
      settingsNewAp.value = { id: '', name: '', ip: '', model: 'i27V1.1', location: '' };
    }

    function removeSettingsAp(index) { settingsAps.value.splice(index, 1); }

    async function saveSettings() {
      settingsSaving.value = true;
      try {
        const apsToSave = settingsAps.value.map(a => ({ id: a.id, name: a.name, ip: a.ip, model: a.model || 'i27V1.1', location: a.location || '' }));
        await API.post('/api/setup/save', { aps: apsToSave });
        showSettings.value = false;
        toast('Settings saved', 'success');
        await refreshAll();
      } catch (e) { toast('Save error: ' + e.message, 'error'); }
      settingsSaving.value = false;
    }

    onMounted(async () => {
      await checkSetup();
      if (setupNeeded.value) return;
      await loadAPs();
      await loadMqttStatus();
      if (selApId.value) { await loadFieldDefs(); await loadSnapshot(selApId.value); }
      // Auto-refresh AP list + MQTT status every 60s (MQTT provides real-time data between polls)
      overviewTimer = setInterval(async () => {
        await loadAPs();
        await loadMqttStatus();
      }, 60000);
    });

    onUnmounted(() => { if (overviewTimer) clearInterval(overviewTimer); });

    // ── Template helpers ──
    function resolveOptions(opts) {
      if (!opts) return {};
      if (Array.isArray(opts)) return Object.fromEntries(opts.map(o => [o, o]));
      return opts;
    }
    function formatCompareVal(v) {
      if (v === undefined || v === null) return '—';
      if (typeof v === 'boolean') return v ? '✓' : '✗';
      if (typeof v === 'object') return JSON.stringify(v);
      return String(v);
    }

    function setTab(key) {
      selTab.value = key;
      nextTick(() => {
        const mods = currentTab.value?.modules || [];
        for (const modName of mods) {
          const def = fieldDefs.value?.fields?.[modName];
          if (def?.tabular && def?.tables) {
            for (const [tkey, tdef] of Object.entries(def.tables)) {
              if (tdef.edcaKeys) initEdcaVals(modName, tkey);
            }
          }
        }
      });
    }

    return {
      aps, selApId, selTab, loading, error, msg, snapshot, fieldDefs,
      editorVals, tabEditorVals, passwordModal, editingRow,
      comparing, compareData, compareSel1, compareSel2, mqttStatus,
      saving, saveErrors,
      selAp, selModel, tabs, currentTab, mainView, sidebarOpen,
      // Bulk
      bulkTargets, bulkSource, bulkSourceData, bulkSaving, bulkResults, showBulkModal, bulkModules, bulkGroups, bulkSelectedCount, cleaning, cleanupResults,
      // Reboot
      rebootTargets, rebooting, rebootResults, rebootModal,
      // Uplink
      uplinkTargets, uplinkSaving, uplinkResults, uplinkConfig,
      // Firmware
      fwInfo, fwLoading, fwOnlineCheck, fwBatchTargets, fwBatchUploading, fwBatchResults, fwFile, fwFileInput, lastOnlineCheck,
      // Compare
      compareLeft, compareRight, compareLoading, compareResult,
      onlineAps, onlineCount, getApName,
      signalClass, clientSignal, clearMsg,
      mqttStatus, dashboardSummary, offlineAps, loadMqttStatus,
      refreshAll, loadSnapshot, setTab,
      getModuleData, findSnapshotKey, getFieldValue, isShown,
      saveModule, requestPassword, confirmPassword, cancelPassword,
      getTableRow, setTableCell, addMacRow, removeMacRow,
      toggleScheduleSlot, setScheduleTime,
      initEdcaVals, parseEdca, formatEdca,
      loadCompare, saveVlanTable, saveQosTable,
      bulkSyncAll, onBulkSourceChange, checkAllBulk, applyBulkSelected, cleanupSsids,
      startReboot, confirmReboot,
      applyUplink,
      loadFirmwareInfo, onFwFileSelected, uploadBatchFirmware, startOnlineUpgrade, checkOnlineAll,
      loadCompare, runCompare,
      resolveOptions, formatCompareVal,
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
