/**
 * Tenda field definitions — complete schema for every module.
 * Used by the frontend to render correct widgets per field.
 *
 * Field types:
 *   text, number, select, toggle, password, slider, mac, schedule, ratebitmask
 *
 * passwordRequired: true → modal chiede password admin prima del SET.
 *   (factory reset, WMM EDCA, rate bitmasks)
 */
const FIELD_DEFS = {
  i27V1: {
    label: 'Tenda i27',
    tabs: {
      status: {
        label: 'Status',
        icon: '📊',
        modules: ['systemStatusGet', 'wifiClientList.2.4G', 'wifiClientList.5G'],
        autoRefresh: true,
      },
      internet: {
        label: 'Internet Settings',
        icon: '🌐',
        modules: ['lanManageCfgGet', 'qvlanGet', 'qosManageGet'],
      },
      wireless: {
        label: 'Wireless',
        icon: '📡',
        modules: [
          'wifiWorkMode',
          'wifiRadioGetIndoor.2.4G', 'wifiRadioGetIndoor.5G',
          'wifiBasicGetIndoor.2.4G.0', 'wifiBasicGetIndoor.5G.0',
          'apSecurityGet.2.4G.0', 'apSecurityGet.5G.0',
          'wifiAdvanceGetIndoor.2.4G', 'wifiAdvanceGetIndoor.5G',
          'apLoadBalanceGet', 'broadcastFilterGet',
          'wifiScheduledGet', 'wifiMacFilterGet.2.4G', 'wifiMacFilterGet.5G',
          'apSteerdRssiGet', 'wifiFastRoamingGet',
        ],
      },
      advanced: {
        label: 'Advanced',
        icon: '⚙️',
        modules: ['remoteWebGet', 'ucloudGet', 'snmpGet'],
      },
      tools: {
        label: 'Tools',
        icon: '🔧',
        modules: ['sysTimeInfoGet', 'sysUserInfoGet', 'sysUplinkCheckGet', 'sysScheduleRebootGet'],
      },
    },
    fields: {
      // ── Status ──
      systemStatusGet: {
        label: 'System Status', setter: null, readOnly: true,
        fields: {
          deviceName: { label: 'Device Name', type: 'text', readonly: true },
          cloudStatus: { label: 'Cloud Status', type: 'text', readonly: true },
          uptime: { label: 'Uptime', type: 'uptime', readonly: true },
          systemTime: { label: 'System Time', type: 'text', readonly: true },
          firmwareVersion: { label: 'Firmware', type: 'text', readonly: true },
          hardwareVersion: { label: 'Hardware', type: 'text', readonly: true },
          clientCount: { label: 'Wireless Clients', type: 'number', readonly: true },
          workingMode: { label: 'Working Mode', type: 'text', readonly: true },
        },
      },
      // ── Internet — LAN IP ──
      lanManageCfgGet: {
        label: 'Management IP', setter: 'lanManageCfgSet',
        fields: {
          manageIp: { label: 'IP Address', type: 'text', pattern: '^(\\d{1,3}\\.){3}\\d{1,3}$', hint: 'es. 192.168.0.2' },
          manageMask: { label: 'Netmask', type: 'text', pattern: '^(\\d{1,3}\\.){3}\\d{1,3}$', hint: 'es. 255.255.255.0' },
        },
      },
      // ── QVLAN ──
      qvlanGet: {
        label: 'VLAN', setter: 'qvlanSet', tabular: true,
        fields: {
          qvlanEn: { label: 'VLAN Enabled', type: 'toggle' },
          pvid: { label: 'PVID', type: 'text' },
          manageVlan: { label: 'Management VLAN', type: 'text' },
          trunkPort: { label: 'Trunk Port', type: 'text' },
        },
        tables: {
          wiredLanPort: {
            label: 'Wired LAN Ports', columns: [
              { key: 'portName', label: 'Port', type: 'text', readonly: true },
              { key: 'vlanId', label: 'VLAN ID', type: 'text' },
              { key: 'trunkFlag', label: 'Trunk', type: 'select', options: { '0': 'Access', '1': 'Trunk' } },
            ],
          },
          ssidQvlan24G: {
            label: 'SSID VLAN — 2.4G', radio: '2.4G',
            columns: [
              { key: 'ssidName', label: 'SSID', type: 'text', readonly: true },
              { key: 'ssidEn', label: 'Enabled', type: 'toggle' },
              { key: 'vlanId', label: 'VLAN ID', type: 'text' },
            ],
          },
          ssidQvlan5G: {
            label: 'SSID VLAN — 5G', radio: '5G',
            columns: [
              { key: 'ssidName', label: 'SSID', type: 'text', readonly: true },
              { key: 'ssidEn', label: 'Enabled', type: 'toggle' },
              { key: 'vlanId', label: 'VLAN ID', type: 'text' },
            ],
          },
        },
      },
      // ── QoS / Traffic Control ──
      qosManageGet: {
        label: 'Traffic Control', setter: 'qosManageSet', tabular: true,
        fields: {
          qosEn: { label: 'QoS', type: 'select', options: { stop: 'Off', start: 'On' } },
        },
        tables: {
          '2.4G': {
            label: 'Traffic Limits — 2.4G', radio: '2.4G',
            columns: [
              { key: 'ssid_index', label: 'SSID', type: 'text', readonly: true },
              { key: 'ssid_uprate', label: 'SSID Upload (Kbps)', type: 'text', placeholder: '0 = unlimited' },
              { key: 'ssid_downrate', label: 'SSID Download (Kbps)', type: 'text', placeholder: '0 = unlimited' },
              { key: 'user_uprate', label: 'Per-User Upload (Kbps)', type: 'text', placeholder: '0 = unlimited' },
              { key: 'user_downrate', label: 'Per-User Download (Kbps)', type: 'text', placeholder: '0 = unlimited' },
            ],
          },
          '5G': {
            label: 'Traffic Limits — 5G', radio: '5G',
            columns: [
              { key: 'ssid_index', label: 'SSID', type: 'text', readonly: true },
              { key: 'ssid_uprate', label: 'SSID Upload (Kbps)', type: 'text', placeholder: '0 = unlimited' },
              { key: 'ssid_downrate', label: 'SSID Download (Kbps)', type: 'text', placeholder: '0 = unlimited' },
              { key: 'user_uprate', label: 'Per-User Upload (Kbps)', type: 'text', placeholder: '0 = unlimited' },
              { key: 'user_downrate', label: 'Per-User Download (Kbps)', type: 'text', placeholder: '0 = unlimited' },
            ],
          },
        },
      },
      // ── Radio ──
      'wifiRadioGetIndoor.2.4G': {
        label: 'Radio — 2.4 GHz', setter: 'wifiRadioSetIndoor', radio: '2.4G',
        fields: {
          wifiEn: { label: 'Radio', type: 'toggle' },
          channel: {
            label: 'Channel', type: 'select',
            options: ['auto', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13'],
          },
          bandwidth: { label: 'Bandwidth', type: 'select', options: ['20', '40'] },
          netMode: {
            label: 'Mode', type: 'select',
            options: ['bgnax', 'bgn', 'bg', 'b', 'acax', 'ac', 'an', 'a'],
          },
          lockChannel: { label: 'Lock Channel', type: 'toggle' },
          lockPower: { label: 'Lock Power', type: 'toggle' },
          currentPower: { label: 'Tx Power (dBm)', type: 'slider', min: 0, max: 30, step: 1 },
          minPower: { label: 'Min Power', type: 'number', readonly: true },
          maxPower: { label: 'Max Power', type: 'number', readonly: true },
          countryCode: { label: 'Country', type: 'text', readonly: true },
          extChannel: { label: 'Extension Channel', type: 'select', options: ['upper', 'lower'], readonly: true },
          probeEn: { label: 'Probe Response', type: 'toggle', readonly: true },
        },
      },
      'wifiRadioGetIndoor.5G': {
        label: 'Radio — 5 GHz', setter: 'wifiRadioSetIndoor', radio: '5G',
        fields: {
          wifiEn: { label: 'Radio', type: 'toggle' },
          channel: {
            label: 'Channel', type: 'select',
            options: ['auto', '36', '40', '44', '48', '52', '56', '60', '64', '100', '104', '108', '112', '116', '120', '124', '128', '132', '136', '140', '149', '153', '157', '161', '165'],
          },
          bandwidth: { label: 'Bandwidth', type: 'select', options: ['20', '40', '80', '160'] },
          netMode: { label: 'Mode', type: 'select', options: ['acax', 'ac', 'an', 'a'] },
          lockChannel: { label: 'Lock Channel', type: 'toggle' },
          lockPower: { label: 'Lock Power', type: 'toggle' },
          currentPower: { label: 'Tx Power (dBm)', type: 'slider', min: 0, max: 30, step: 1 },
          minPower: { label: 'Min Power', type: 'number', readonly: true },
          maxPower: { label: 'Max Power', type: 'number', readonly: true },
          countryCode: { label: 'Country', type: 'text', readonly: true },
          extChannel: { label: 'Extension Channel', type: 'select', options: ['upper', 'lower'], readonly: true },
          probeEn: { label: 'Probe Response', type: 'toggle', readonly: true },
        },
      },
      // ── SSID ──
      'wifiBasicGetIndoor.2.4G.0': {
        label: 'SSID — 2.4 GHz', setter: 'wifiBasicSetIndoor', radio: '2.4G', ssidIndex: '0',
        fields: {
          ssid: { label: 'SSID Name', type: 'text', maxLength: 32 },
          ssidEn: { label: 'Enabled', type: 'toggle' },
          broadcastSsid: { label: 'Broadcast SSID', type: 'toggle' },
          ssidEncode: { label: 'Encoding', type: 'select', options: { 'utf-8': 'UTF-8', 'gb2312': 'GB2312' } },
          maxClientNum: { label: 'Max Clients', type: 'number', min: 1, max: 128 },
          staIsolate: { label: 'Client Isolation', type: 'toggle' },
          wmf: { label: 'WMF', type: 'toggle' },
          ssidIsolate: { label: 'SSID Isolation', type: 'toggle' },
          isGuest: { label: 'Guest Network', type: 'toggle' },
          scheduledEn: { label: 'Schedule Enabled', type: 'toggle' },
          avalidClientNum: { label: 'Max Allowed', type: 'number', readonly: true },
          ssidList: { label: 'All SSIDs', type: 'text', readonly: true },
        },
      },
      'wifiBasicGetIndoor.5G.0': {
        label: 'SSID — 5 GHz', setter: 'wifiBasicSetIndoor', radio: '5G', ssidIndex: '0',
        fields: {
          ssid: { label: 'SSID Name', type: 'text', maxLength: 32 },
          ssidEn: { label: 'Enabled', type: 'toggle' },
          broadcastSsid: { label: 'Broadcast SSID', type: 'toggle' },
          ssidEncode: { label: 'Encoding', type: 'select', options: { 'utf-8': 'UTF-8', 'gb2312': 'GB2312' } },
          maxClientNum: { label: 'Max Clients', type: 'number', min: 1, max: 128 },
          staIsolate: { label: 'Client Isolation', type: 'toggle' },
          wmf: { label: 'WMF', type: 'toggle' },
          ssidIsolate: { label: 'SSID Isolation', type: 'toggle' },
          isGuest: { label: 'Guest Network', type: 'toggle' },
          scheduledEn: { label: 'Schedule Enabled', type: 'toggle' },
          avalidClientNum: { label: 'Max Allowed', type: 'number', readonly: true },
          ssidList: { label: 'All SSIDs', type: 'text', readonly: true },
        },
      },
      // ── Security ──
      'apSecurityGet.2.4G.0': {
        label: 'Security — 2.4 GHz', setter: 'apSecuritySet', radio: '2.4G', ssidIndex: '0',
        fields: {
          secType: {
            label: 'Security Mode', type: 'select',
            options: { none: 'None', wep: 'WEP', 'wpa-psk': 'WPA-PSK', 'wpa2-psk': 'WPA2-PSK', 'mixed wpa/wpa2-psk': 'WPA/WPA2 Mixed', wpa3sae: 'WPA3-SAE', wpa3saewpa2psk: 'WPA3/WPA2 Mixed' },
          },
          wpapskAuth: { label: 'WPA Auth', type: 'select', options: { aes: 'AES', tkip: 'TKIP', 'tkip+aes': 'TKIP+AES' }, showIf: { secType: ['wpa-psk', 'wpa2-psk', 'mixed wpa/wpa2-psk', 'wpa3saewpa2psk'] } },
          wpapskPwd: { label: 'WiFi Password', type: 'password', showIf: { secType: ['wpa-psk', 'wpa2-psk', 'mixed wpa/wpa2-psk', 'wpa3sae', 'wpa3saewpa2psk'] } },
          // WEP fields (showIf secType=wep) — read-only in snapper, editable in full editor
          wepAuth: { label: 'WEP Auth', type: 'select', options: { open: 'Open', share: 'Shared' }, showIf: { secType: ['wep'] } },
          wepDefaultKey: { label: 'Default Key', type: 'select', options: { '1': 'Key 1', '2': 'Key 2', '3': 'Key 3', '4': 'Key 4' }, showIf: { secType: ['wep'] } },
          wepKey1: { label: 'WEP Key 1', type: 'password', showIf: { secType: ['wep'] } },
          wepKey2: { label: 'WEP Key 2', type: 'password', showIf: { secType: ['wep'] } },
          wepKey3: { label: 'WEP Key 3', type: 'password', showIf: { secType: ['wep'] } },
          wepKey4: { label: 'WEP Key 4', type: 'password', showIf: { secType: ['wep'] } },
        },
      },
      'apSecurityGet.5G.0': {
        label: 'Security — 5 GHz', setter: 'apSecuritySet', radio: '5G', ssidIndex: '0',
        fields: {
          secType: {
            label: 'Security Mode', type: 'select',
            options: { none: 'None', wep: 'WEP', 'wpa-psk': 'WPA-PSK', 'wpa2-psk': 'WPA2-PSK', 'mixed wpa/wpa2-psk': 'WPA/WPA2 Mixed', wpa3sae: 'WPA3-SAE', wpa3saewpa2psk: 'WPA3/WPA2 Mixed' },
          },
          wpapskAuth: { label: 'WPA Auth', type: 'select', options: { aes: 'AES', tkip: 'TKIP', 'tkip+aes': 'TKIP+AES' }, showIf: { secType: ['wpa-psk', 'wpa2-psk', 'mixed wpa/wpa2-psk', 'wpa3saewpa2psk'] } },
          wpapskPwd: { label: 'WiFi Password', type: 'password', showIf: { secType: ['wpa-psk', 'wpa2-psk', 'mixed wpa/wpa2-psk', 'wpa3sae', 'wpa3saewpa2psk'] } },
          wepAuth: { label: 'WEP Auth', type: 'select', options: { open: 'Open', share: 'Shared' }, showIf: { secType: ['wep'] } },
          wepDefaultKey: { label: 'Default Key', type: 'select', options: { '1': 'Key 1', '2': 'Key 2', '3': 'Key 3', '4': 'Key 4' }, showIf: { secType: ['wep'] } },
          wepKey1: { label: 'WEP Key 1', type: 'password', showIf: { secType: ['wep'] } },
          wepKey2: { label: 'WEP Key 2', type: 'password', showIf: { secType: ['wep'] } },
          wepKey3: { label: 'WEP Key 3', type: 'password', showIf: { secType: ['wep'] } },
          wepKey4: { label: 'WEP Key 4', type: 'password', showIf: { secType: ['wep'] } },
        },
      },
      // ── RF Optimization ──
      'wifiAdvanceGetIndoor.2.4G': {
        label: 'RF Optimization — 2.4 GHz', setter: 'wifiAdvanceSetIndoor', radio: '2.4G',
        fields: {
          beacon: { label: 'Beacon Interval (ms)', type: 'select', options: ['100', '200', '300', '400', '500', '1000'] },
          fragment: { label: 'Fragment Threshold', type: 'select', options: ['256', '512', '768', '1024', '1280', '1536', '1792', '2048', '2346'] },
          rts: { label: 'RTS Threshold', type: 'select', options: ['0', '256', '512', '768', '1024', '1280', '1536', '1792', '2048', '2347'] },
          dtim: { label: 'DTIM Interval', type: 'select', options: ['1', '2', '3', '4', '5', '10', '15', '20', '255'] },
          rssi: { label: 'RSSI Threshold (dBm)', type: 'slider', min: -90, max: -60, step: 1 },
          disconnectRssi: { label: 'Disconnect RSSI', type: 'select', options: { '0': 'Off', '-90': '-90', '-85': '-85', '-80': '-80', '-75': '-75', '-70': '-70' } },
          staTimeout: { label: 'Station Timeout (min)', type: 'number', min: 1, max: 1440 },
          penetration: { label: 'Signal Transmission', type: 'select', options: { high: 'Coverage', normal: 'Normal', low: 'Speed' } },
          recieverMode: { label: 'Receiver Mode', type: 'select', options: { '1': '1 Stream', '2': '2 Streams', '3': 'Auto' } },
          apsd: { label: 'APSD', type: 'toggle' },
          atf: { label: 'ATF (Air Interface)', type: 'toggle' },
          mimo: { label: 'MU-MIMO', type: 'toggle' },
          ofdma: { label: 'OFDMA', type: 'toggle' },
          prio5gRSSI: { label: '5G Priority RSSI', type: 'slider', min: -90, max: -30, step: 1 },
        },
      },
      'wifiAdvanceGetIndoor.5G': {
        label: 'RF Optimization — 5 GHz', setter: 'wifiAdvanceSetIndoor', radio: '5G',
        fields: {
          beacon: { label: 'Beacon Interval (ms)', type: 'select', options: ['100', '200', '300', '400', '500', '1000'] },
          fragment: { label: 'Fragment Threshold', type: 'select', options: ['256', '512', '768', '1024', '1280', '1536', '1792', '2048', '2346'] },
          rts: { label: 'RTS Threshold', type: 'select', options: ['0', '256', '512', '768', '1024', '1280', '1536', '1792', '2048', '2347'] },
          dtim: { label: 'DTIM Interval', type: 'select', options: ['1', '2', '3', '4', '5', '10', '15', '20', '255'] },
          rssi: { label: 'RSSI Threshold (dBm)', type: 'slider', min: -90, max: -60, step: 1 },
          disconnectRssi: { label: 'Disconnect RSSI', type: 'select', options: { '0': 'Off', '-90': '-90', '-85': '-85', '-80': '-80', '-75': '-75', '-70': '-70' } },
          staTimeout: { label: 'Station Timeout (min)', type: 'number', min: 1, max: 1440 },
          penetration: { label: 'Signal Transmission', type: 'select', options: { high: 'Coverage', normal: 'Normal', low: 'Speed' } },
          recieverMode: { label: 'Receiver Mode', type: 'select', options: { '1': '1 Stream', '2': '2 Streams', '3': 'Auto' } },
          apsd: { label: 'APSD', type: 'toggle' },
          atf: { label: 'ATF (Air Interface)', type: 'toggle' },
          mimo: { label: 'MU-MIMO', type: 'toggle' },
          ofdma: { label: 'OFDMA', type: 'toggle' },
        },
      },
      // ── Load Balancing ──
      apLoadBalanceGet: {
        label: 'Load Balancing', setter: 'apLoadBalanceSet',
        fields: {
          enable: { label: 'Enabled', type: 'select', options: { '0': 'Off', '1': 'On' } },
          start_val: { label: 'Start Threshold (clients)', type: 'number', min: 1, max: 128 },
          diff_val: { label: 'Difference Threshold', type: 'number', min: 1, max: 50 },
          time: { label: 'Check Interval (s)', type: 'number', min: 5, max: 600 },
          counts: { label: 'Count Threshold', type: 'number', min: 1, max: 50 },
        },
      },
      // ── Broadcast Filter / Advanced Settings ──
      broadcastFilterGet: {
        label: 'Advanced Settings (Broadcast Filter)', setter: 'broadcastFilterSet',
        fields: {
          broadcastLimitEn: { label: 'Broadcast Rate Limit', type: 'toggle' },
          broadcastLimitNum: { label: 'Broadcast Limit (pps)', type: 'number', min: 0, max: 3000, showIf: { broadcastLimitEn: ['true', true] } },
          multicastLimitEn: { label: 'Multicast Rate Limit', type: 'toggle' },
          multicastLimitNum: { label: 'Multicast Limit (pps)', type: 'number', min: 0, max: 3000, showIf: { multicastLimitEn: ['true', true] } },
        },
      },
      // ── MAC Filter ──
      'wifiMacFilterGet.2.4G': {
        label: 'MAC Access Control — 2.4 GHz', setter: 'wifiMacFilterSet', radio: '2.4G', ssidIndex: '0', tabular: true,
        fields: {
          filterEnable: { label: 'MAC Filter', type: 'toggle' },
          filterMode: { label: 'Filter Mode', type: 'select', options: { deny: 'Deny Listed', allow: 'Allow Listed' }, showIf: { filterEnable: [true, 'true'] } },
        },
        tables: {
          macList: {
            label: 'MAC Addresses', keyField: 'mac',
            columns: [{ key: 'mac', label: 'MAC Address', type: 'mac' }],
            editable: true,
          },
        },
      },
      'wifiMacFilterGet.5G': {
        label: 'MAC Access Control — 5 GHz', setter: 'wifiMacFilterSet', radio: '5G', ssidIndex: '0', tabular: true,
        fields: {
          filterEnable: { label: 'MAC Filter', type: 'toggle' },
          filterMode: { label: 'Filter Mode', type: 'select', options: { deny: 'Deny Listed', allow: 'Allow Listed' }, showIf: { filterEnable: [true, 'true'] } },
        },
        tables: {
          macList: {
            label: 'MAC Addresses', keyField: 'mac',
            columns: [{ key: 'mac', label: 'MAC Address', type: 'mac' }],
            editable: true,
          },
        },
      },
      // ── Wi-Fi Schedule ──
      wifiScheduledGet: {
        label: 'Wi-Fi Schedule', setter: 'wifiScheduledSet', tabular: true,
        tables: {
          schedules: {
            label: 'Schedule per SSID',
            columns: [
              { key: 'ssid', label: 'SSID', type: 'text', readonly: true },
              { key: 'wifiSsidEn', label: 'SSID Active', type: 'toggle', readonly: true },
              { key: 'enable', label: 'Schedule On', type: 'toggle' },
              { key: 'scheduledList', label: 'Time Slots', type: 'schedule' },
            ],
            editable: true,
          },
        },
      },
      // ── Band Steering RSSI ──
      apSteerdRssiGet: {
        label: 'Band Steering', setter: 'apSteerdRssiSet',
        fields: {
          band_safe_rssi_5: { label: '5G Band Steering RSSI (dBm)', type: 'slider', min: -100, max: -40, step: 1 },
          ap_safe_rssi_5: { label: 'AP Steering RSSI (dBm)', type: 'slider', min: -100, max: -40, step: 1 },
        },
      },
      // ── Fast Roaming (11k/11v) — solo i27 ──
      wifiFastRoamingGet: {
        label: 'Fast Roaming (802.11k/v)', setter: 'wifiFastRoamingSet',
        fields: {
          fastRoaming: { label: 'Roaming Mode', type: 'select', options: { '11k': '802.11k', '11v': '802.11v', '11k;11v': '802.11k + 802.11v', 'disable': 'Disabled' } },
          fastRoamingNum: { label: 'Roaming RSSI — 2.4G (dBm)', type: 'slider', min: -100, max: -40, step: 1 },
          fastRoamingNum_5g: { label: 'Roaming RSSI — 5G (dBm)', type: 'slider', min: -100, max: -40, step: 1 },
        },
      },
      // ── Working Mode ──
      wifiWorkMode: {
        label: 'Working Mode', setter: null, readOnly: true,
        fields: {
          wifiWorkMode: { label: 'Mode', type: 'text', readonly: true },
          apinfo: { label: 'AP Info', type: 'text', readonly: true },
        },
      },
      // ── Remote Management ──
      remoteWebGet: {
        label: 'Remote Management', setter: 'remoteWebSet',
        fields: {
          remoteWebEn: { label: 'Remote Web', type: 'toggle' },
          remoteWebType: { label: 'Type', type: 'select', options: { '0': 'Cloud URL', '1': 'Custom IP' } },
          remoteWebIp: { label: 'Remote IP', type: 'text', showIf: { remoteWebType: ['1'] } },
          remoteWebAddr: { label: 'Cloud URL', type: 'text', readonly: true },
        },
      },
      // ── Cloud Maintenance ──
      ucloudGet: {
        label: 'Cloud Maintenance', setter: 'ucloudSet',
        fields: {
          ucloudEn: { label: 'Cloud Enabled', type: 'toggle' },
          ucloudMode: { label: 'Cloud Mode', type: 'select', options: { '1': 'CloudFi', '2': 'Private' } },
          ucloudUrl: { label: 'Cloud URL', type: 'text', readonly: true },
        },
      },
      // ── SNMP ──
      snmpGet: {
        label: 'SNMP', setter: 'snmpSet',
        fields: {
          snmpEn: { label: 'SNMP', type: 'toggle' },
          snmpver: { label: 'Version', type: 'select', options: { '1': 'v1', '2': 'v2c', '3': 'v3' } },
          adminName: { label: 'Admin Name', type: 'text' },
          readCommunity: { label: 'Read Community', type: 'text' },
          RWCommunity: { label: 'Read/Write Community', type: 'text' },
          location: { label: 'Location', type: 'text' },
          deviceName: { label: 'Device Name', type: 'text' },
        },
      },
      // ── Date & Time ──
      sysTimeInfoGet: {
        label: 'Date & Time', setter: 'sysTimeInfoSet', getter: 'sysTimeInfoGet',
        getterBody: '', // MUST be empty string, not object!
        fields: {
          type: { label: 'Time Source', type: 'select', options: { net: 'Sync with Internet', manual: 'Manual' } },
          timeZone: {
            label: 'Time Zone', type: 'select',
            options: {
              '0': '(GMT) Casablanca', '1': '(GMT) Dublin, London', '2': '(GMT+01:00) Amsterdam, Berlin, Rome', '3': '(GMT+01:00) Brussels, Paris', '4': '(GMT+02:00) Helsinki, Riga', '5': '(GMT+02:00) Athens, Bucharest', '6': '(GMT+03:00) Moscow', '7': '(GMT+04:00) Abu Dhabi', '8': '(GMT+05:00) Islamabad', '9': '(GMT+05:30) New Delhi', '10': '(GMT+06:00) Astana', '11': '(GMT+07:00) Bangkok', '12': '(GMT+08:00) Beijing, Taipei', '13': '(GMT+08:00) Singapore', '14': '(GMT+09:00) Tokyo', '15': '(GMT+10:00) Sydney', '16': '(GMT+12:00) Auckland', '17': '(GMT-01:00) Azores', '18': '(GMT-03:00) Brasilia', '19': '(GMT-04:00) Santiago', '20': '(GMT-05:00) New York', '21': '(GMT-06:00) Mexico City', '22': '(GMT-07:00) Mountain Time', '23': '(GMT-08:00) Los Angeles', '24': '(GMT-09:00) Alaska', '25': '(GMT-10:00) Hawaii', '26': '(GMT-11:00) Samoa', '27': '(GMT-12:00) Date Line West',
            },
          },
          timeInterval: { label: 'Sync Interval', type: 'select', options: { '1800': '30 min', '3600': '1 hr', '7200': '2 hrs', '43200': '12 hrs', '86400': '1 day', '172800': '2 days', '604800': '7 days', '1209600': '2 weeks' }, showIf: { type: ['net'] } },
          time: { label: 'Manual Time (YYYY-MM-DD-hh-mm-ss)', type: 'text', placeholder: '2026-07-07-14-30-00', showIf: { type: ['manual'] }, pattern: '^\\d{4}-\\d{2}-\\d{2}-\\d{2}-\\d{2}-\\d{2}$' },
        },
      },
      // ── System Account ──
      sysUserInfoGet: {
        label: 'System Account', setter: 'sysUserInfoSet',
        fields: {
          adminName: { label: 'Admin Username', type: 'text' },
          userName: { label: 'User Username', type: 'text' },
          userEn: { label: 'User Account Enabled', type: 'toggle' },
        },
      },
      // ── Uplink Detection ──
      sysUplinkCheckGet: {
        label: 'Uplink Detection', setter: 'sysUplinkCheckSet',
        fields: {
          enable: { label: 'Enabled', type: 'toggle' },
          timeInterval: { label: 'Check Interval (s)', type: 'number', min: 5, max: 600, showIf: { enable: [true] } },
          hostIp1: { label: 'Host IP 1', type: 'text', placeholder: '192.168.0.1' },
          hostIp2: { label: 'Host IP 2', type: 'text', placeholder: '8.8.8.8' },
        },
      },
      // ── Scheduled Reboot ──
      sysScheduleRebootGet: {
        label: 'Scheduled Reboot', setter: 'sysScheduleRebootSet',
        fields: {
          enable: { label: 'Enabled', type: 'toggle' },
          time: { label: 'Time (HH:MM)', type: 'text', pattern: '^\\d{2}:\\d{2}$', showIf: { enable: [true] } },
        },
      },
    },
  },
  // ── OAP1200V2 differences ───────────────────────
  OAP1200V2: {
    label: 'Tenda OAP1200',
    tabs: null, // inherits from i27V1 tabs
    fields: {
      // Radio — extra fields
      'wifiRadioGetIndoor.2.4G': {
        label: 'Radio — 2.4 GHz', setter: 'wifiRadioSetIndoor', radio: '2.4G',
        fields: {
          wifiEn: { label: 'Radio', type: 'toggle' },
          channel: { label: 'Channel', type: 'select', options: ['auto','1','2','3','4','5','6','7','8','9','10','11','12','13'] },
          bandwidth: { label: 'Bandwidth', type: 'select', options: ['20', '40'] },
          netMode: { label: 'Mode', type: 'select', options: ['bgn', 'bg', 'b'] },
          lockChannel: { label: 'Lock Channel', type: 'toggle' },
          lockPower: { label: 'Lock Power', type: 'toggle' },
          lockwebPower: { label: 'Lock Web Power', type: 'toggle' },
          currentPower: { label: 'Tx Power (dBm)', type: 'slider', min: 0, max: 30, step: 1 },
          minPower: { label: 'Min Power', type: 'number', readonly: true },
          maxPower: { label: 'Max Power', type: 'number', readonly: true },
          countryCode: { label: 'Country', type: 'text', readonly: true },
          shortGI: { label: 'Short Guard Interval', type: 'toggle' },
          wlLeadCode: { label: 'Preamble', type: 'select', options: { short: 'Short', long: 'Long' } },
          extChannel: { label: 'Extension Channel', type: 'select', options: ['upper', 'lower'], readonly: true },
          probeEn: { label: 'Probe Response', type: 'toggle', readonly: true },
        },
      },
      'wifiRadioGetIndoor.5G': {
        label: 'Radio — 5 GHz', setter: 'wifiRadioSetIndoor', radio: '5G',
        fields: {
          wifiEn: { label: 'Radio', type: 'toggle' },
          channel: { label: 'Channel', type: 'select', options: ['auto','36','40','44','48','52','56','60','64','100','104','108','112','116','120','124','128','132','136','140','149','153','157','161','165'] },
          bandwidth: { label: 'Bandwidth', type: 'select', options: ['20', '40', '80'] },
          netMode: { label: 'Mode', type: 'select', options: ['ac', 'an', 'a'] },
          lockChannel: { label: 'Lock Channel', type: 'toggle' },
          lockPower: { label: 'Lock Power', type: 'toggle' },
          lockwebPower: { label: 'Lock Web Power', type: 'toggle' },
          currentPower: { label: 'Tx Power (dBm)', type: 'slider', min: 0, max: 30, step: 1 },
          minPower: { label: 'Min Power', type: 'number', readonly: true },
          maxPower: { label: 'Max Power', type: 'number', readonly: true },
          countryCode: { label: 'Country', type: 'text', readonly: true },
          shortGI: { label: 'Short Guard Interval', type: 'toggle' },
          wlLeadCode: { label: 'Preamble', type: 'select', options: { short: 'Short', long: 'Long' } },
          extChannel: { label: 'Extension Channel', type: 'select', options: ['upper', 'lower'], readonly: true },
          probeEn: { label: 'Probe Response', type: 'toggle', readonly: true },
        },
      },
      // WMM — OAP only
      'wifiWmmGet.2.4G': {
        label: 'WMM — 2.4 GHz', setter: 'wifiWmmSet', radio: '2.4G', passwordRequired: true,
        fields: {
          wmmEn: { label: 'WMM', type: 'toggle' },
          noAck: { label: 'No-Ack', type: 'toggle' },
          wmmMode: { label: 'WMM Mode', type: 'select', options: { high: 'High Performance', normal: 'Normal', low: 'Low Latency' } },
        },
      },
      'wifiWmmGet.5G': {
        label: 'WMM — 5 GHz', setter: 'wifiWmmSet', radio: '5G', passwordRequired: true,
        fields: {
          wmmEn: { label: 'WMM', type: 'toggle' },
          noAck: { label: 'No-Ack', type: 'toggle' },
          wmmMode: { label: 'WMM Mode', type: 'select', options: { high: 'High Performance', normal: 'Normal', low: 'Low Latency' } },
        },
      },
      // WMM EDCA tables (passwordRequired)
      'wifiWmmGet.edca.2.4G': {
        label: 'WMM EDCA — 2.4 GHz', setter: 'wifiWmmSet', radio: '2.4G', passwordRequired: true, tabular: true,
        tables: {
          wmmConfig: {
            label: 'AP EDCA Parameters', edcaKeys: ['cwmin', 'cwmax', 'aifs', 'txop'],
            columns: [
              { key: '_ac', label: 'Queue', type: 'text', readonly: true },
              { key: '_cwmin', label: 'CW Min', type: 'number', min: 0, max: 15 },
              { key: '_cwmax', label: 'CW Max', type: 'number', min: 0, max: 1023 },
              { key: '_aifs', label: 'AIFS', type: 'number', min: 1, max: 15 },
              { key: '_txop', label: 'TXOP', type: 'number', min: 0, max: 8192 },
            ],
            editable: true,
          },
          wmmStaConfig: {
            label: 'Station EDCA Parameters',
            columns: [
              { key: '_ac', label: 'Queue', type: 'text', readonly: true },
              { key: '_cwmin', label: 'CW Min', type: 'number', min: 0, max: 15 },
              { key: '_cwmax', label: 'CW Max', type: 'number', min: 0, max: 1023 },
              { key: '_aifs', label: 'AIFS', type: 'number', min: 1, max: 15 },
              { key: '_txop', label: 'TXOP', type: 'number', min: 0, max: 8192 },
            ],
            editable: true,
          },
        },
      },
      'wifiWmmGet.edca.5G': {
        label: 'WMM EDCA — 5 GHz', setter: 'wifiWmmSet', radio: '5G', passwordRequired: true, tabular: true,
        tables: {
          wmmConfig: {
            label: 'AP EDCA Parameters', edcaKeys: ['cwmin', 'cwmax', 'aifs', 'txop'],
            columns: [
              { key: '_ac', label: 'Queue', type: 'text', readonly: true },
              { key: '_cwmin', label: 'CW Min', type: 'number', min: 0, max: 15 },
              { key: '_cwmax', label: 'CW Max', type: 'number', min: 0, max: 1023 },
              { key: '_aifs', label: 'AIFS', type: 'number', min: 1, max: 15 },
              { key: '_txop', label: 'TXOP', type: 'number', min: 0, max: 8192 },
            ],
            editable: true,
          },
          wmmStaConfig: {
            label: 'Station EDCA Parameters',
            columns: [
              { key: '_ac', label: 'Queue', type: 'text', readonly: true },
              { key: '_cwmin', label: 'CW Min', type: 'number', min: 0, max: 15 },
              { key: '_cwmax', label: 'CW Max', type: 'number', min: 0, max: 1023 },
              { key: '_aifs', label: 'AIFS', type: 'number', min: 1, max: 15 },
              { key: '_txop', label: 'TXOP', type: 'number', min: 0, max: 8192 },
            ],
            editable: true,
          },
        },
      },
      // Band Steering — OAP variant
      apSteerdRssiGet: {
        label: 'Band Steering', setter: 'apSteerdRssiSet',
        fields: {
          dot11r_enable: { label: '802.11r Fast Transition', type: 'toggle' },
          lrssi_2: { label: '2.4G RSSI Threshold (dBm)', type: 'slider', min: -100, max: -40, step: 1 },
          lrssi_5: { label: '5G RSSI Threshold (dBm)', type: 'slider', min: -100, max: -40, step: 1 },
          ap_safe_rssi: { label: 'AP Safe RSSI (dBm)', type: 'slider', min: -100, max: -40, step: 1 },
        },
      },
      // Deployment Mode — OAP only
      deployInfoGet: {
        label: 'Deployment Mode', setter: 'deployInfoSet',
        fields: {
          deployType: { label: 'Deployment', type: 'select', options: { local: 'Local', cloud: 'Cloud AC' } },
          deviceName: { label: 'Device Name', type: 'text' },
          cloudAcIp: { label: 'Cloud AC IP', type: 'text', showIf: { deployType: ['cloud'] } },
          cloudAcUpgradeIp: { label: 'Cloud AC Upgrade IP', type: 'text', showIf: { deployType: ['cloud'] } },
        },
      },
      // VLAN — OAP has no trunkPort
      qvlanGet: {
        label: 'VLAN', setter: 'qvlanSet', tabular: true,
        fields: {
          qvlanEn: { label: 'VLAN Enabled', type: 'toggle' },
          pvid: { label: 'PVID', type: 'text' },
          manageVlan: { label: 'Management VLAN', type: 'text' },
        },
        tables: {
          wiredLanPort: {
            label: 'Wired LAN Ports', columns: [
              { key: 'portName', label: 'Port', type: 'text', readonly: true },
              { key: 'vlanId', label: 'VLAN ID', type: 'text' },
              { key: 'trunkFlag', label: 'Trunk', type: 'select', options: { '0': 'Access', '1': 'Trunk' } },
            ],
          },
          ssidQvlan24G: {
            label: 'SSID VLAN — 2.4G', radio: '2.4G',
            columns: [
              { key: 'ssidName', label: 'SSID', type: 'text', readonly: true },
              { key: 'ssidEn', label: 'Enabled', type: 'toggle' },
              { key: 'vlanId', label: 'VLAN ID', type: 'text' },
            ],
          },
          ssidQvlan5G: {
            label: 'SSID VLAN — 5G', radio: '5G',
            columns: [
              { key: 'ssidName', label: 'SSID', type: 'text', readonly: true },
              { key: 'ssidEn', label: 'Enabled', type: 'toggle' },
              { key: 'vlanId', label: 'VLAN ID', type: 'text' },
            ],
          },
        },
      },
      // MAC filter — OAP has no filterMode field
      'wifiMacFilterGet.2.4G': {
        label: 'MAC Access Control — 2.4 GHz', setter: 'wifiMacFilterSet', radio: '2.4G', ssidIndex: '0', tabular: true,
        fields: { filterEnable: { label: 'MAC Filter', type: 'toggle' } },
        tables: {
          macList: {
            label: 'MAC Addresses', keyField: 'mac',
            columns: [{ key: 'mac', label: 'MAC Address', type: 'mac' }],
            editable: true,
          },
        },
      },
      'wifiMacFilterGet.5G': {
        label: 'MAC Access Control — 5 GHz', setter: 'wifiMacFilterSet', radio: '5G', ssidIndex: '0', tabular: true,
        fields: { filterEnable: { label: 'MAC Filter', type: 'toggle' } },
        tables: {
          macList: {
            label: 'MAC Addresses', keyField: 'mac',
            columns: [{ key: 'mac', label: 'MAC Address', type: 'mac' }],
            editable: true,
          },
        },
      },
      // QoS — OAP has additional fields
      qosManageGet: {
        label: 'Traffic Control', setter: 'qosManageSet', tabular: true,
        fields: { qosEn: { label: 'QoS', type: 'select', options: { stop: 'Off', start: 'On' } } },
        tables: {
          '2.4G': {
            label: 'Traffic Limits — 2.4G', radio: '2.4G',
            columns: [
              { key: 'ssid_index', label: 'SSID', type: 'text', readonly: true },
              { key: 'ruleEn', label: 'Rule Enabled', type: 'toggle' },
              { key: 'ssid_uprate', label: 'SSID Upload (Kbps)', type: 'text', placeholder: '0 = unlimited' },
              { key: 'ssid_downrate', label: 'SSID Download (Kbps)', type: 'text', placeholder: '0 = unlimited' },
              { key: 'user_uprate', label: 'Per-User Upload (Kbps)', type: 'text', placeholder: '0 = unlimited' },
              { key: 'user_downrate', label: 'Per-User Download (Kbps)', type: 'text', placeholder: '0 = unlimited' },
              { key: 'ip_range', label: 'IP Range', type: 'text', placeholder: '192.168.0.10-192.168.0.50' },
              { key: 'remark', label: 'Note', type: 'text' },
            ],
          },
          '5G': {
            label: 'Traffic Limits — 5G', radio: '5G',
            columns: [
              { key: 'ssid_index', label: 'SSID', type: 'text', readonly: true },
              { key: 'ruleEn', label: 'Rule Enabled', type: 'toggle' },
              { key: 'ssid_uprate', label: 'SSID Upload (Kbps)', type: 'text', placeholder: '0 = unlimited' },
              { key: 'ssid_downrate', label: 'SSID Download (Kbps)', type: 'text', placeholder: '0 = unlimited' },
              { key: 'user_uprate', label: 'Per-User Upload (Kbps)', type: 'text', placeholder: '0 = unlimited' },
              { key: 'user_downrate', label: 'Per-User Download (Kbps)', type: 'text', placeholder: '0 = unlimited' },
              { key: 'ip_range', label: 'IP Range', type: 'text', placeholder: '192.168.0.10-192.168.0.50' },
              { key: 'remark', label: 'Note', type: 'text' },
            ],
          },
        },
      },
      // Account — OAP adminName is the password not username
      sysUserInfoGet: {
        label: 'System Account', setter: 'sysUserInfoSet',
        fields: {
          adminName: { label: 'Admin Password', type: 'password' },
          userName: { label: 'User Username', type: 'text' },
          userEn: { label: 'User Account Enabled', type: 'toggle' },
        },
      },
    },
  },
};

/**
 * Resolve field definitions for a model with fallback to i27V1 defaults.
 */
function getFieldDefs(modelStr) {
  const isOap = (modelStr || '').includes('OAP1200');
  const base = FIELD_DEFS.i27V1;
  const overrides = isOap ? FIELD_DEFS.OAP1200V2 : null;

  function mergeFieldDefs() {
    const merged = {};
    // Copy base fields
    for (const [key, def] of Object.entries(base.fields)) {
      merged[key] = { ...def };
      if (overrides && overrides.fields && overrides.fields[key]) {
        // Deep-merge field defs
        const ov = overrides.fields[key];
        for (const k of Object.keys(ov)) {
          if (k === 'fields' && ov.fields) {
            merged[key].fields = { ...merged[key].fields, ...ov.fields };
          } else if (k === 'tables' && ov.tables) {
            merged[key].tables = { ...merged[key].tables, ...ov.tables };
          } else {
            merged[key][k] = ov[k];
          }
        }
      }
    }
    // Add any OAP-only field defs (like WMM)
    if (overrides && overrides.fields) {
      for (const [key, def] of Object.entries(overrides.fields)) {
        if (!merged[key]) {
          merged[key] = { ...def };
        }
      }
    }
    return merged;
  }

  // Merge tab modules
  const tabs = {};
  for (const [tabKey, tabDef] of Object.entries(base.tabs)) {
    tabs[tabKey] = { ...tabDef, modules: [...tabDef.modules] };
    if (isOap && overrides.tabs) {
      // OAP adds WMM modules to wireless tab, deployInfoGet to advanced, no wifiFastRoaming
      if (tabKey === 'wireless') {
        tabs[tabKey].modules = tabs[tabKey].modules.filter(m => !m.startsWith('wifiFastRoaming'));
        tabs[tabKey].modules.push('wifiWmmGet.2.4G', 'wifiWmmGet.5G', 'wifiWmmGet.edca.2.4G', 'wifiWmmGet.edca.5G');
      }
      if (tabKey === 'advanced') {
        tabs[tabKey].modules.push('deployInfoGet');
      }
    }
  }

  return {
    label: isOap ? (overrides || base).label : base.label,
    tabs,
    fields: mergeFieldDefs(),
  };
}

module.exports = { FIELD_DEFS, getFieldDefs };
