var DBus, NM_CONNECTIVITY_FULL, NM_CONNECTIVITY_LIMITED, NM_DEVICE_TYPE_WIFI, NM_STATE_CONNECTED_GLOBAL, Promise, SERVICE, WHITE_LIST, _, bus, dbus, deleteConnection, exec, execAsync, getConnection, getConnections, getDevice, getDevices, isConnectionValid, isDeviceValid, ref, spawn, systemd,
  indexOf = [].indexOf || function(item) { for (var i = 0, l = this.length; i < l; i++) { if (i in this && this[i] === item) return i; } return -1; };

Promise = require('bluebird');

ref = require('child_process'), spawn = ref.spawn, exec = ref.exec;

execAsync = Promise.promisify(exec);

DBus = require('./dbus-promise');

_ = require('lodash');

dbus = new DBus();

bus = dbus.getBus('system');

systemd = require('./systemd');

SERVICE = 'org.freedesktop.NetworkManager';

WHITE_LIST = ['resin-sample', 'Wired connection 1'];

NM_STATE_CONNECTED_GLOBAL = 70;

NM_DEVICE_TYPE_WIFI = 2;

NM_CONNECTIVITY_LIMITED = 3;

NM_CONNECTIVITY_FULL = 4;

exports.start = function() {
  return systemd.start('NetworkManager.service');
};

exports.stop = function() {
  return systemd.stop('NetworkManager.service');
};

exports.ready = function() {
  return systemd.waitUntilState('NetworkManager.service', 'active');
};

exports.isSetup = function() {
  return getConnections().map(isConnectionValid).then(function(results) {
    return indexOf.call(results, true) >= 0;
  });
};

exports.setCredentials = function(ssid, passphrase) {
  var connection;
  connection = {
    '802-11-wireless': {
      ssid: _.invokeMap(ssid, 'charCodeAt')
    },
    connection: {
      id: ssid,
      type: '802-11-wireless'
    }
  };
  if (passphrase !== "") {
    connection = _.merge(connection, {
      '802-11-wireless-security': {
        'auth-alg': 'open',
        'key-mgmt': 'wpa-psk',
        'psk': passphrase
      }
    });
  }
  console.log('Saving connection');
  console.log(connection);
  return bus.getInterfaceAsync(SERVICE, '/org/freedesktop/NetworkManager/Settings', 'org.freedesktop.NetworkManager.Settings').then(function(settings) {
    return settings.AddConnectionAsync(connection);
  }).then(function() {
    return execAsync('sync');
  });
};

exports.clearCredentials = function() {
  return getConnections().map(deleteConnection);
};

exports.connect = function(timeout) {
  return getDevices().filter(isDeviceValid).then(function(validDevices) {
    if (validDevices.length === 0) {
      throw new Error('No valid devices found.');
    }
    return getConnections().filter(isConnectionValid).then(function(validConnections) {
      if (validConnections.length === 0) {
        throw new Error('No valid connections found.');
      }
      return bus.getInterfaceAsync(SERVICE, '/org/freedesktop/NetworkManager', 'org.freedesktop.NetworkManager').delay(1000).then(function(manager) {
        return manager.ActivateConnectionAsync(validConnections[0], validDevices[0], '/').then(function() {
          return new Promise(function(resolve, reject) {
            var handler;
            handler = function(value) {
              if (value === NM_STATE_CONNECTED_GLOBAL) {
                manager.removeListener('StateChanged', handler);
                return resolve();
              }
            };
            manager.on('StateChanged', handler);
            manager.CheckConnectivityAsync().then(function(state) {
              if (state === NM_CONNECTIVITY_FULL || state === NM_CONNECTIVITY_LIMITED) {
                manager.removeListener('StateChanged', handler);
                return resolve();
              }
            });
            return setTimeout(function() {
              manager.removeListener('StateChanged', handler);
              return reject(new Error('Timed out'));
            }, timeout);
          });
        });
      });
    });
  });
};

getConnections = function() {
  return bus.getInterfaceAsync(SERVICE, '/org/freedesktop/NetworkManager/Settings', 'org.freedesktop.NetworkManager.Settings').call('ListConnectionsAsync');
};

getConnection = function(connection) {
  return bus.getInterfaceAsync(SERVICE, connection, 'org.freedesktop.NetworkManager.Settings.Connection');
};

deleteConnection = function(connection) {
  return getConnection(connection).then(function(connection) {
    return connection.GetSettingsAsync().then(function(settings) {
      var ref1;
      if (ref1 = settings.connection.id, indexOf.call(WHITE_LIST, ref1) < 0) {
        return connection.DeleteAsync();
      }
    });
  });
};

isConnectionValid = function(connection) {
  return getConnection(connection).call('GetSettingsAsync').then(function(settings) {
    var ref1;
    return ref1 = settings.connection.id, indexOf.call(WHITE_LIST, ref1) < 0;
  });
};

getDevices = function() {
  return bus.getInterfaceAsync(SERVICE, '/org/freedesktop/NetworkManager', 'org.freedesktop.NetworkManager').call('GetDevicesAsync');
};

getDevice = function(device) {
  return bus.getInterfaceAsync(SERVICE, device, 'org.freedesktop.NetworkManager.Device');
};

isDeviceValid = function(device) {
  return getDevice(device).call('getPropertyAsync', 'DeviceType').then(function(property) {
    return property === NM_DEVICE_TYPE_WIFI;
  });
};

// ---
// generated by coffee-script 1.9.2
