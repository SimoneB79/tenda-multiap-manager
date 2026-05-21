/**
 * Tenda module definitions — FULL config.
 * Every readable module from the Tenda firmware.
 */

const MODULE_DEFS = {
  i27V1: {
    label: 'Tenda i27',
    radios: ['2.4G', '5G'],
    maxSsid: 8,
    snapshotBatches: function() {
      const batches = [];

      batches.push([
        { name: 'wifiWorkMode', params: { radio: 'ap' }, key: 'workMode', label: 'Work Mode', category: 'system' },
        { name: 'ucloudGet', params: {}, key: 'cloud', label: 'Cloud Management', category: 'system' },
        { name: 'sysScheduleRebootGet', params: {}, key: 'scheduleReboot', label: 'Scheduled Reboot', category: 'system' },
        { name: 'sysUplinkCheckGet', params: {}, key: 'uplinkCheck', label: 'Uplink Detection', category: 'system' },
      ]);

      batches.push([
        { name: 'lanManageCfgGet', params: {}, key: 'lanIp', label: 'IP Management', category: 'network' },
      ]);

      batches.push([
        { name: 'qvlanGet', params: {}, key: 'vlan', label: 'VLAN', category: 'network' },
      ]);

      batches.push([
        { name: 'qosManageGet', params: {}, key: 'qos', label: 'QoS', category: 'network' },
      ]);

      batches.push([
        { name: 'apSteerdRssiGet', params: {}, key: 'steerRssi', label: 'Band Steering RSSI', category: 'roaming' },
        { name: 'wifiFastRoamingGet', params: {}, key: 'fastRoaming', label: 'Fast Roaming (11k/11v)', category: 'roaming' },
      ]);

      batches.push([
        { name: 'wifiScheduledGet', params: { radio: '' }, key: 'wifiSchedule', label: 'Wi-Fi Schedule', category: 'wifi' },
      ]);

      for (const radio of this.radios) {
        const rKey = radio === '2.4G' ? '24g' : '5g';

        batches.push([
          { name: 'wifiRadioGetIndoor', params: { radio }, key: `radio_${rKey}`, label: `Radio ${radio}`, category: 'radio' },
        ]);

        for (let i = 0; i < this.maxSsid; i++) {
          batches.push([
            { name: 'wifiBasicGetIndoor', params: { radio, ssidIndex: String(i) }, key: `ssid_${rKey}_${i}`, label: `SSID ${radio} #${i + 1}`, category: 'wifi' },
            { name: 'apSecurityGet', params: { radio, ssidIndex: String(i) }, key: `sec_${rKey}_${i}`, label: `Security ${radio} #${i + 1}`, category: 'wifi' },
          ]);
        }

        batches.push([
          { name: 'wifiMacFilterGet', params: { radio, ssidIndex: '0' }, key: `macFilter_${rKey}`, label: `MAC Filter ${radio}`, category: 'wifi' },
        ]);

        batches.push([
          { name: 'wifiClientList', params: { radio, ssidIndex: '' }, key: `clients_${rKey}`, label: `Client ${radio}`, category: 'clients' },
        ]);
      }

      return batches;
    },
    writableModules: {
      wifiBasicSetIndoor: { label: 'SSID Settings' },
      apSecuritySet: { label: 'Security' },
      wifiRadioSetIndoor: { label: 'Radio' },
    },
  },
  OAP1200V2: {
    label: 'Tenda OAP1200',
    radios: ['2.4G', '5G'],
    maxSsid: 8,
    snapshotBatches: function() {
      return MODULE_DEFS.i27V1.snapshotBatches.call(this);
    },
    writableModules: {
      wifiBasicSetIndoor: { label: 'SSID Settings' },
      apSecuritySet: { label: 'Security' },
      wifiRadioSetIndoor: { label: 'Radio' },
    },
  },
};

function getModuleDef(modelStr) {
  if (!modelStr) return MODULE_DEFS.i27V1;
  if (modelStr.includes('OAP1200')) return MODULE_DEFS.OAP1200V2;
  return MODULE_DEFS.i27V1;
}

module.exports = { MODULE_DEFS, getModuleDef };