/**
 * BLE communication manager for MetricAthlete devices.
 * This is a class-based wrapper around the original BLE protocol logic.
 */

import { formatBytes } from './format';

const BLE_PROTO = {
  marker: 0xAE,
  respFileList: 0x02,
  respFileChunk: 0x03,
  cmdRequestFileList: 0x05,
  cmdDownloadFile: 0x06,
  cmdDeleteFile: 0x07,
};

const BLE_CONFIG = {
  serviceUuid: '761993fb-ad28-4438-a7b0-6ab3f2e03816',
  notifyCharacteristicUuid: '5e0c4072-ee4d-450d-90a5-a1fefdb84692',
  writeCharacteristicUuid: 'fb4a9352-9bcd-4cc6-80e4-ae37d16ffbf1',
};

function concatBytes(a, b) {
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}

function parseFilename(bytes) {
  const text = new TextDecoder().decode(bytes);
  const nullIdx = text.indexOf('\0');
  return (nullIdx >= 0 ? text.slice(0, nullIdx) : text).trim();
}

export class BLEManager {
  constructor() {
    this.device = null;
    this.notifyChar = null;
    this.writeChar = null;
    this.availableFiles = [];
    this.fileCache = {};
    this.downloadChunks = [];
    this.downloadBytes = 0;
    this.expectedFileSize = 0;
    this.selectedFilename = '';
    this.isDownloading = false;
    this.idleTimer = null;
    this.listRxBuffer = new Uint8Array(0);
    this.rxFrameBuffer = new Uint8Array(0);

    // Callbacks
    this.onStatusChange = null;    // (text, isError) => void
    this.onFilesUpdated = null;    // (files[]) => void
    this.onProgress = null;        // (received, total) => void
    this.onDisconnect = null;      // () => void
    this.onFileReady = null;       // (filename, payload: Uint8Array) => void

    this._onDataChunk = this._onDataChunk.bind(this);
  }

  get isConnected() {
    return !!(this.device && this.device.gatt && this.device.gatt.connected && this.writeChar);
  }

  get deviceName() {
    return this.device ? (this.device.name || 'BLE Device') : null;
  }

  async connect() {
    if (!navigator.bluetooth) {
      this._status('Web Bluetooth is not available. Use Chrome/Edge over HTTPS or localhost.', true);
      return false;
    }

    try {
      this._status('Searching for devices…');
      this._resetDownloadState();

      this.device = await navigator.bluetooth.requestDevice({
        filters: [{ namePrefix: 'POD' }],
        optionalServices: [BLE_CONFIG.serviceUuid],
      });

      this.device.addEventListener('gattserverdisconnected', () => {
        this.notifyChar = null;
        this.writeChar = null;
        this._resetDownloadState();
        this.availableFiles = [];
        this.onDisconnect?.();
        this._status('Device disconnected.');
      });

      this._status('Connecting…');
      const server = await this.device.gatt.connect();
      const service = await server.getPrimaryService(BLE_CONFIG.serviceUuid);
      this.notifyChar = await service.getCharacteristic(BLE_CONFIG.notifyCharacteristicUuid);
      this.writeChar = await service.getCharacteristic(BLE_CONFIG.writeCharacteristicUuid);
      this.notifyChar.addEventListener('characteristicvaluechanged', this._onDataChunk);
      await this.notifyChar.startNotifications();

      this._status('Connected. Fetching file list…');
      await this.requestFileList();
      return true;
    } catch (err) {
      console.error('BLE connect error:', err);
      this._status('Connection failed: ' + err.message, true);
      return false;
    }
  }

  async disconnect() {
    try {
      if (this.notifyChar) {
        await this.notifyChar.stopNotifications();
        this.notifyChar.removeEventListener('characteristicvaluechanged', this._onDataChunk);
      }
    } catch (e) { /* ignore */ }

    if (this.device?.gatt?.connected) this.device.gatt.disconnect();
    this.notifyChar = null;
    this.writeChar = null;
    this.availableFiles = [];
    this.rxFrameBuffer = new Uint8Array(0);
    this.listRxBuffer = new Uint8Array(0);
    this._resetDownloadState();
  }

  async requestFileList() {
    this.listRxBuffer = new Uint8Array(0);
    this.rxFrameBuffer = new Uint8Array(0);
    this.availableFiles = [];
    this._status('');
    await this._writeCommand(new Uint8Array([BLE_PROTO.marker, BLE_PROTO.cmdRequestFileList, 1, 1]));
  }

  async refreshFileList() {
    if (!this.isConnected) { this._status('Not connected.', true); return; }
    try { await this.requestFileList(); }
    catch (err) { this._status('Could not refresh: ' + err.message, true); }
  }

  async downloadFile(index) {
    if (index < 0 || index >= this.availableFiles.length) {
      this._status('Select a file first.', true);
      return;
    }
    const picked = this.availableFiles[index];

    if (this.fileCache[picked.name]) {
      this.onFileReady?.(picked.name, this.fileCache[picked.name]);
      return;
    }

    if (!this.isConnected) { this._status('Not connected.', true); return; }

    const filenameBytes = new TextEncoder().encode(picked.name);
    if (filenameBytes.length > 255) { this._status('Filename too long.', true); return; }

    const cmd = new Uint8Array(3 + filenameBytes.length);
    cmd[0] = BLE_PROTO.marker;
    cmd[1] = BLE_PROTO.cmdDownloadFile;
    cmd[2] = filenameBytes.length;
    cmd.set(filenameBytes, 3);

    try {
      this._startDownloadSession(picked.name, picked.size);
      this._status('Requesting ' + picked.name + '…');
      await this._writeCommand(cmd);
    } catch (err) {
      this._resetDownloadState();
      this._status('Download failed: ' + err.message, true);
    }
  }

  async deleteFile(filename) {
    if (!this.isConnected) return;
    const enc = new TextEncoder();
    const filenameBytes = enc.encode(filename);
    const cmd = new Uint8Array(3 + filenameBytes.length);
    cmd[0] = BLE_PROTO.marker;
    cmd[1] = BLE_PROTO.cmdDeleteFile;
    cmd[2] = filenameBytes.length;
    cmd.set(filenameBytes, 3);

    this._status('Deleting ' + filename + '…');
    try {
      await this._writeCommand(cmd);
      await new Promise(resolve => setTimeout(resolve, 500));
      await this.requestFileList();
    } catch (err) {
      this._status('Delete failed: ' + err.message, true);
    }
  }

  isCached(filename) {
    return !!this.fileCache[filename];
  }

  // ---- Private ----

  _status(text, isError = false) {
    this.onStatusChange?.(text, isError);
  }

  async _writeCommand(bytes) {
    if (!this.writeChar) throw new Error('BLE write characteristic not ready');
    if (this.writeChar.writeValueWithoutResponse) {
      await this.writeChar.writeValueWithoutResponse(bytes);
    } else {
      await this.writeChar.writeValue(bytes);
    }
  }

  _onDataChunk(event) {
    const dv = event.target.value;
    const bytes = new Uint8Array(dv.buffer, dv.byteOffset, dv.byteLength);
    this._processRxFrames(bytes);
  }

  _processRxFrames(rawBytes) {
    this.rxFrameBuffer = concatBytes(this.rxFrameBuffer, rawBytes);
    while (this.rxFrameBuffer.length >= 3) {
      if (this.rxFrameBuffer[0] !== BLE_PROTO.marker) {
        const markerIdx = this.rxFrameBuffer.indexOf(BLE_PROTO.marker);
        if (markerIdx < 0) { this.rxFrameBuffer = new Uint8Array(0); return; }
        this.rxFrameBuffer = this.rxFrameBuffer.slice(markerIdx);
        if (this.rxFrameBuffer.length < 3) return;
      }
      const msgType = this.rxFrameBuffer[1];
      const payloadLen = this.rxFrameBuffer[2];
      const frameLen = 3 + payloadLen;
      if (this.rxFrameBuffer.length < frameLen) return;
      const payload = this.rxFrameBuffer.slice(3, frameLen);
      if (msgType === BLE_PROTO.respFileList) {
        this.listRxBuffer = concatBytes(this.listRxBuffer, payload);
        this._tryParseFileList();
      } else if (msgType === BLE_PROTO.respFileChunk) {
        this._onFileChunk(payload);
      }
      this.rxFrameBuffer = this.rxFrameBuffer.slice(frameLen);
    }
  }

  _tryParseFileList() {
    if (this.listRxBuffer.length < 1) return false;
    const count = this.listRxBuffer[0];
    const expectedLen = 1 + count * (32 + 4);
    if (this.listRxBuffer.length < expectedLen) return false;

    const files = [];
    let off = 1;
    for (let i = 0; i < count; i++) {
      const name = parseFilename(this.listRxBuffer.slice(off, off + 32));
      off += 32;
      const size = this.listRxBuffer[off] | (this.listRxBuffer[off + 1] << 8) |
        (this.listRxBuffer[off + 2] << 16) | (this.listRxBuffer[off + 3] << 24);
      off += 4;
      if (name) files.push({ name, size: size >>> 0 });
    }

    this.availableFiles = files;
    this.onFilesUpdated?.(files);
    this._status(files.length ? `${files.length} file${files.length > 1 ? 's' : ''} — select one and tap Download` : 'No files found on device.');
    this.listRxBuffer = this.listRxBuffer.length > expectedLen ? this.listRxBuffer.slice(expectedLen) : new Uint8Array(0);
    return true;
  }

  _startDownloadSession(fileName, expectedSize) {
    this.downloadChunks = [];
    this.downloadBytes = 0;
    this.expectedFileSize = expectedSize || 0;
    this.selectedFilename = fileName;
    this.isDownloading = true;
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.onProgress?.(0, this.expectedFileSize);
  }

  _onFileChunk(payloadBytes) {
    if (!this.isDownloading || !payloadBytes.length) return;
    const copy = new Uint8Array(payloadBytes.length);
    copy.set(payloadBytes);
    this.downloadChunks.push(copy);
    this.downloadBytes += copy.length;
    this.onProgress?.(this.downloadBytes, this.expectedFileSize);

    this._status(`Downloading… ${formatBytes(this.downloadBytes)}${this.expectedFileSize ? ' / ' + formatBytes(this.expectedFileSize) : ''}`);

    if (!this.expectedFileSize) {
      this._scheduleIdleFinalize();
      return;
    }
    if (this.downloadBytes >= this.expectedFileSize) this._finalizeDownload('complete');
  }

  _scheduleIdleFinalize() {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => this._finalizeDownload('idle timeout'), 200);
  }

  _finalizeDownload(reason) {
    if (!this.isDownloading) return;
    this.isDownloading = false;
    if (this.idleTimer) { clearTimeout(this.idleTimer); this.idleTimer = null; }

    if (!this.downloadBytes) {
      this._status('No data received for ' + this.selectedFilename + '.', true);
      return;
    }

    const payload = this._flattenChunks();
    this.fileCache[this.selectedFilename] = payload;
    this.onFileReady?.(this.selectedFilename, payload);
  }

  _flattenChunks() {
    const out = new Uint8Array(this.downloadBytes);
    let pos = 0;
    for (const chunk of this.downloadChunks) {
      out.set(chunk, pos);
      pos += chunk.length;
    }
    return out;
  }

  _resetDownloadState() {
    this.downloadChunks = [];
    this.downloadBytes = 0;
    this.expectedFileSize = 0;
    this.selectedFilename = '';
    this.isDownloading = false;
    if (this.idleTimer) { clearTimeout(this.idleTimer); this.idleTimer = null; }
  }
}

// Singleton instance
export const bleManager = new BLEManager();
