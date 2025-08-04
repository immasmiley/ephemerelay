// WebSocket connection
const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
const wsUrl = `${wsProtocol}//${window.location.host}`;
let ws = null;

// UI Elements
const connectionStatus = document.getElementById('connectionStatus');
const connectionText = document.getElementById('connectionText');
const networkNodes = document.getElementById('networkNodes');
const totalEvents = document.getElementById('totalEvents');
const activeSubscriptions = document.getElementById('activeSubscriptions');
const networkLoad = document.getElementById('networkLoad');
const storageUsed = document.getElementById('storageUsed');
const eventList = document.getElementById('eventList');

// Storage contribution elements
const storageMeterFill = document.getElementById('storageMeterFill');
const storageAvailable = document.getElementById('storageAvailable');
const storageAmount = document.getElementById('storageAmount');
const storageValue = document.getElementById('storageValue');
const contributeButton = document.getElementById('contributeButton');
const stopContributingButton = document.getElementById('stopContributingButton');
const contributionStatus = document.getElementById('contributionStatus');

class StorageContributor {
    constructor() {
        this.isContributing = false;
        this.startTime = null;
        this.storageAmount = 1; // GB
        this.nodeId = null;
        this.statusUpdateInterval = null;

        this.initializeUI();
        this.checkStorageAvailability();
    }

    async initializeUI() {
        // Update storage amount display when slider changes
        storageAmount.addEventListener('input', () => {
            this.storageAmount = parseInt(storageAmount.value);
            storageValue.textContent = `${this.storageAmount} GB`;
        });

        // Handle contribute button click
        contributeButton.addEventListener('click', () => this.toggleContribution());

        // Handle stop contributing button click
        stopContributingButton.addEventListener('click', () => this.toggleContribution());
    }

    async checkStorageAvailability() {
        try {
            const { quota, usage } = await navigator.storage.estimate();
            const availableGB = (quota - usage) / (1024 * 1024 * 1024);
            const usedPercent = (usage / quota) * 100;

            storageMeterFill.style.width = `${usedPercent}%`;
            storageAvailable.textContent = `${availableGB.toFixed(1)} GB Available`;

            // Enable/disable contribute button based on available storage
            contributeButton.disabled = availableGB < 1;
            if (contributeButton.disabled) {
                storageAvailable.textContent += ' (Minimum 1 GB required)';
            }

            // Request persistent storage
            if (navigator.storage && navigator.storage.persist) {
                const isPersisted = await navigator.storage.persist();
                console.log('Storage persistence:', isPersisted ? 'granted' : 'denied');
            }
        } catch (error) {
            console.error('Error checking storage:', error);
            storageAvailable.textContent = 'Could not check storage';
            contributeButton.disabled = true;
        }
    }

    async toggleContribution() {
        if (this.isContributing) {
            await this.stopContributing();
        } else {
            await this.startContributing();
        }
    }

    async startContributing() {
        try {
            const response = await fetch('/api/nodes/register', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    storageAmount: this.storageAmount * 1024 * 1024 * 1024, // Convert GB to bytes
                    endpoint: wsUrl,
                    pubkey: await this.generateOrGetPubkey()
                })
            });

            const data = await response.json();
            if (!data.success) {
                throw new Error(data.error || 'Failed to register node');
            }

            this.nodeId = data.nodeId;
            this.isContributing = true;
            this.startTime = Date.now();

            // Update UI
            contributeButton.style.display = 'none';
            contributionStatus.style.display = 'block';
            
            // Start status updates
            this.startStatusUpdates();
        } catch (error) {
            console.error('Error starting contribution:', error);
            alert('Failed to start contributing: ' + error.message);
        }
    }

    async stopContributing() {
        try {
            const response = await fetch('/api/nodes/unregister', {
                method: 'POST',
                headers: {
                    'X-Node-ID': this.nodeId
                }
            });

            const data = await response.json();
            if (!data.success) {
                throw new Error(data.error || 'Failed to unregister node');
            }

            this.isContributing = false;
            this.nodeId = null;
            
            // Update UI
            contributeButton.style.display = 'block';
            contributionStatus.style.display = 'none';
            
            // Stop status updates
            this.stopStatusUpdates();
        } catch (error) {
            console.error('Error stopping contribution:', error);
            alert('Failed to stop contributing: ' + error.message);
        }
    }

    startStatusUpdates() {
        // Update immediately
        this.updateStatus();
        
        // Then update every 5 seconds
        this.statusUpdateInterval = setInterval(() => this.updateStatus(), 5000);
    }

    stopStatusUpdates() {
        if (this.statusUpdateInterval) {
            clearInterval(this.statusUpdateInterval);
            this.statusUpdateInterval = null;
        }
    }

    async updateStatus() {
        try {
            const response = await fetch('/api/nodes/status', {
                headers: {
                    'X-Node-ID': this.nodeId
                }
            });

            const data = await response.json();
            
            // Update status display
            document.getElementById('storageUsedValue').textContent = 
                this.formatBytes(data.usedStorage);
            document.getElementById('eventsStoredValue').textContent = 
                data.eventsStored.toLocaleString();
            document.getElementById('networkLoadValue').textContent = 
                `${Math.round(data.networkLoad)}%`;
            
            // Update uptime
            this.updateUptime();
        } catch (error) {
            console.error('Error updating status:', error);
        }
    }

    updateUptime() {
        if (!this.startTime) return;
        
        const uptime = Date.now() - this.startTime;
        const hours = Math.floor(uptime / (1000 * 60 * 60));
        const minutes = Math.floor((uptime % (1000 * 60 * 60)) / (1000 * 60));
        
        document.getElementById('uptimeValue').textContent = 
            `${hours}h ${minutes}m`;
    }

    async generateOrGetPubkey() {
        // TODO: Implement proper key generation/management
        return 'temp-pubkey-' + Math.random().toString(36).substring(2);
    }

    formatBytes(bytes) {
        const units = ['B', 'KB', 'MB', 'GB'];
        let value = bytes;
        let unitIndex = 0;
        
        while (value >= 1024 && unitIndex < units.length - 1) {
            value /= 1024;
            unitIndex++;
        }
        
        return `${value.toFixed(1)} ${units[unitIndex]}`;
    }
}

class KeyManager {
  constructor() {
    this.privateKeyInput = document.getElementById('privateKey');
    this.publicKeyDisplay = document.getElementById('publicKeyDisplay');
    this.authStatus = document.getElementById('authStatus');
    this.authenticateBtn = document.getElementById('authenticateBtn');
    this.keyInfo = document.getElementById('keyInfo');

    // Add event listeners
    this.privateKeyInput.addEventListener('input', () => this.handlePrivateKeyInput());
    this.authenticateBtn.addEventListener('click', () => this.authenticate());

    // Load stored key if exists
    this.loadStoredKey();
  }

  isValidHexKey(key) {
    // Check if it's a valid hex string of correct length (64 characters = 32 bytes)
    return /^[0-9a-fA-F]{64}$/.test(key);
  }

  isValidNsecKey(key) {
    // Bech32 nsec: prefix nsec1 + 58 base32 chars (data+checksum)
    return /^nsec1[qpzry9x8gf2tvdw0s3jn54khce6mua7l]{58}$/.test(key);
  }

  isValidPrivateKey(key) {
    return this.isValidHexKey(key) || this.isValidNsecKey(key);
  }

  // Bech32 encoding/decoding functions
  bech32ToWords(bytes) {
    const words = [];
    let value = 0;
    let bits = 0;
    
    for (let i = 0; i < bytes.length; i++) {
      value = (value << 8) | bytes[i];
      bits += 8;
      
      while (bits >= 5) {
        words.push((value >>> (bits - 5)) & 31);
        bits -= 5;
      }
    }
    
    if (bits > 0) {
      words.push((value << (5 - bits)) & 31);
    }
    
    return words;
  }

  wordsToBech32(words) {
    const bytes = [];
    let value = 0;
    let bits = 0;
    
    for (let i = 0; i < words.length; i++) {
      value = (value << 5) | words[i];
      bits += 5;
      
      while (bits >= 8) {
        bytes.push((value >>> (bits - 8)) & 255);
        bits -= 8;
      }
    }
    
    return new Uint8Array(bytes);
  }

  async nsecToHex(nsec) {
    try {
      if (!this.isValidNsecKey(nsec)) throw new Error('Invalid nsec format');
      const charset = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
      const dataPart = nsec.slice(5); // remove 'nsec1'
      const values = [];
      for (let ch of dataPart) {
        const idx = charset.indexOf(ch);
        if (idx === -1) throw new Error('Invalid bech32 character');
        values.push(idx);
      }
      // Remove the last 6 checksum words
      const dataWords = values.slice(0, -6);
      // Convert 5-bit words to 8-bit bytes
      let bits = 0;
      let buffer = 0;
      const bytes = [];
      for (const word of dataWords) {
        buffer = (buffer << 5) | word;
        bits += 5;
        if (bits >= 8) {
          bits -= 8;
          bytes.push((buffer >> bits) & 0xff);
        }
      }
      const privBytes = bytes.slice(0, 32); // first 32 bytes
      if (privBytes.length !== 32) throw new Error('Invalid decoded length');
      return Array.from(privBytes)
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
    } catch (error) {
      console.error('Error converting nsec to hex:', error);
      throw error;
    }
  }

  async hexToNsec(hexKey) {
    try {
      // Convert hex to bytes
      const bytes = this.hexToArrayBuffer(hexKey);
      
      // Simple bech32 encode (this is a simplified version)
      // In production, you'd use a proper bech32 library
      const base32Chars = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
      let value = 0;
      for (let i = 0; i < bytes.byteLength; i++) {
        value = (value << 8) | new Uint8Array(bytes)[i];
      }
      
      // Convert to base32
      let encoded = '';
      while (value > 0) {
        encoded = base32Chars[value % 32] + encoded;
        value = Math.floor(value / 32);
      }
      
      // Pad to 52 characters
      while (encoded.length < 52) {
        encoded = 'q' + encoded;
      }
      
      return 'nsec1' + encoded;
    } catch (error) {
      console.error('Error converting hex to nsec:', error);
      throw new Error('Invalid hex format');
    }
  }

  handlePrivateKeyInput() {
    const privateKey = this.privateKeyInput.value.trim();
    
    // Enable/disable authenticate button based on key validity
    if (this.isValidPrivateKey(privateKey)) {
      this.authenticateBtn.disabled = false;
      this.privateKeyInput.classList.remove('invalid');
    } else {
      this.authenticateBtn.disabled = true;
      this.privateKeyInput.classList.add('invalid');
    }
  }

  async authenticate() {
    const privateKey = this.privateKeyInput.value.trim();
    
    if (!this.isValidPrivateKey(privateKey)) {
      alert('Invalid private key format. Must be 64-character hex or valid nsec format.');
      return;
    }

    try {
      let hexKey = privateKey;
      
      // Convert nsec to hex if needed
      if (this.isValidNsecKey(privateKey)) {
        hexKey = await this.nsecToHex(privateKey);
      }
      
      // Convert hex to Uint8Array for WebCrypto
      const keyData = this.hexToArrayBuffer(hexKey);
      
      // Import the private key
      const key = await window.crypto.subtle.importKey(
        'raw',
        keyData,
        { name: 'ECDSA', namedCurve: 'P-256' },
        true,
        ['sign']
      );

      // Derive public key
      const publicKey = await this.derivePublicKey(hexKey);
      
      // Update UI
      this.publicKeyDisplay.textContent = publicKey;
      this.authStatus.textContent = 'Authenticated';
      this.keyInfo.style.display = 'block';
      
      // Store the key
      this.storeKey(privateKey); // Store original format
      
      return true;
    } catch (error) {
      console.error('Authentication failed:', error);
      alert('Authentication failed. Invalid private key.');
      return false;
    }
  }

  async derivePublicKey(privateKey) {
    try {
      // Convert hex to ArrayBuffer
      const keyData = this.hexToArrayBuffer(privateKey);
      
      // Import the private key
      const privateKeyObj = await window.crypto.subtle.importKey(
        'raw',
        keyData,
        { name: 'ECDSA', namedCurve: 'P-256' },
        true,
        ['sign']
      );

      // For ECDSA, we need to generate a key pair to get the public key
      // In a real implementation, you'd use a library like noble-secp256k1
      // For now, we'll create a simple hash-based public key
      const keyHash = await window.crypto.subtle.digest('SHA-256', keyData);
      const publicKeyHex = this.arrayBufferToHex(keyHash).slice(0, 64);
      
      // Convert to npub format
      const npubKey = await this.hexToNpub(publicKeyHex);
      
      return npubKey;
    } catch (error) {
      console.error('Error deriving public key:', error);
      throw new Error('Failed to derive public key');
    }
  }

  async hexToNpub(hexKey) {
    try {
      // Convert hex to bytes
      const bytes = this.hexToArrayBuffer(hexKey);
      
      // Simple bech32 encode (this is a simplified version)
      // In production, you'd use a proper bech32 library
      const base32Chars = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
      let value = 0;
      for (let i = 0; i < bytes.byteLength; i++) {
        value = (value << 8) | new Uint8Array(bytes)[i];
      }
      
      // Convert to base32
      let encoded = '';
      while (value > 0) {
        encoded = base32Chars[value % 32] + encoded;
        value = Math.floor(value / 32);
      }
      
      // Pad to 52 characters
      while (encoded.length < 52) {
        encoded = 'q' + encoded;
      }
      
      return 'npub1' + encoded;
    } catch (error) {
      console.error('Error converting hex to npub:', error);
      throw new Error('Invalid hex format');
    }
  }

  // Helper to convert hex string to ArrayBuffer
  hexToArrayBuffer(hex) {
    const bytes = new Uint8Array(hex.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
    return bytes.buffer;
  }

  // Helper to convert ArrayBuffer to hex string
  arrayBufferToHex(buffer) {
    return Array.from(new Uint8Array(buffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }

  storeKey(privateKeyHex) {
        try {
            // In a real implementation, this would be properly encrypted
            localStorage.setItem('ephemerelay_key', privateKeyHex);
        } catch (error) {
            console.error('Failed to store key:', error);
        }
    }

  loadStoredKey() {
    try {
      const storedKey = localStorage.getItem('ephemerelay_key');
      if (storedKey && this.isValidPrivateKey(storedKey)) {
        this.privateKeyInput.value = storedKey;
        this.handlePrivateKeyInput();
        // Don't auto-authenticate on load, let user choose
      }
    } catch (error) {
      console.error('Failed to load stored key:', error);
    }
  }

  getPublicKey() {
        return this.publicKey;
    }

  async sign(data) {
        if (!this.privateKey) {
            throw new Error('Not authenticated');
        }

        try {
            const signature = await window.crypto.subtle.sign(
                {
                    name: "ECDSA",
                    hash: {name: "SHA-256"},
                },
                this.privateKey,
                new TextEncoder().encode(data)
            );
            return this.arrayBufferToHex(signature);
        } catch (error) {
            console.error('Signing error:', error);
            throw error;
        }
    }
}

// Initialize key manager
const keyManager = new KeyManager();

// Initialize storage contribution
const contributor = new StorageContributor();

// Minimal WebSocket connection to backend
function connectWebSocket() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const url = `${protocol}//${window.location.host}`;
  try {
    const socket = new WebSocket(url);
    socket.onopen = () => console.log('WebSocket connected');
    socket.onerror = (err) => console.error('WebSocket error', err);
    socket.onclose = () => console.log('WebSocket closed');
  } catch (err) {
    console.error('Failed to connect WebSocket:', err);
  }
} 