// Nostr Interface Implementation
class NostrInterface {
  constructor() {
    this.nostrClient = null;
    this.isAuthenticated = false;
    this.isContributing = false;
    this.storageAmount = 1;
    this.startTime = null;
    this.statusUpdateInterval = null;
    
    this.initializeElements();
    this.initializeEventListeners();
    this.checkStorageAvailability();
  }

  initializeElements() {
    // Authentication elements
    this.privateKeyInput = document.getElementById('privateKey');
    this.publicKeyDisplay = document.getElementById('publicKeyDisplay');
    this.authStatus = document.getElementById('authStatus');
    this.authenticateBtn = document.getElementById('authenticateBtn');
    this.keyInfo = document.getElementById('keyInfo');
    this.keyToggleBtn = document.getElementById('keyToggleBtn');

    // Relay management elements
    this.relayUrlInput = document.getElementById('relayUrl');
    this.addRelayBtn = document.getElementById('addRelayBtn');
    this.relayList = document.getElementById('relayList');

    // Storage contribution elements
    this.storageMeterFill = document.getElementById('storageMeterFill');
    this.storageAvailable = document.getElementById('storageAvailable');
    this.storageAmountInput = document.getElementById('storageAmount');
    this.storageValue = document.getElementById('storageValue');
    this.contributeButton = document.getElementById('contributeButton');
    this.stopContributingButton = document.getElementById('stopContributingButton');
    this.contributionStatus = document.getElementById('contributionStatus');

    // Event feed elements
    this.messageInput = document.getElementById('messageInput');
    this.sendMessageBtn = document.getElementById('sendMessageBtn');
    this.eventFeed = document.getElementById('eventFeed');

    // Statistics elements
    this.connectionStatus = document.getElementById('connectionStatus');
    this.relayCount = document.getElementById('relayCount');
    this.totalEvents = document.getElementById('totalEvents');
    this.activeSubscriptions = document.getElementById('activeSubscriptions');
    this.networkLoad = document.getElementById('networkLoad');
    this.storageUsed = document.getElementById('storageUsed');

    // Status elements
    this.storageUsedValue = document.getElementById('storageUsedValue');
    this.eventsStoredValue = document.getElementById('eventsStoredValue');
    this.networkLoadValue = document.getElementById('networkLoadValue');
    this.uptimeValue = document.getElementById('uptimeValue');
  }

  initializeEventListeners() {
    // Authentication
    this.privateKeyInput.addEventListener('input', () => this.handlePrivateKeyInput());
    this.authenticateBtn.addEventListener('click', () => this.authenticate());
    this.keyToggleBtn.addEventListener('click', () => this.toggleKeyVisibility());

    // Relay management
    this.addRelayBtn.addEventListener('click', () => this.addRelay());
    this.relayUrlInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') this.addRelay();
    });

    // Storage contribution
    this.storageAmountInput.addEventListener('input', () => {
      this.storageAmount = parseInt(this.storageAmountInput.value);
      this.storageValue.textContent = `${this.storageAmount} GB`;
    });
    this.contributeButton.addEventListener('click', () => this.toggleContribution());
    this.stopContributingButton.addEventListener('click', () => this.toggleContribution());

    // Event feed
    this.messageInput.addEventListener('input', () => {
      this.sendMessageBtn.disabled = !this.messageInput.value.trim() || !this.isAuthenticated;
    });
    this.sendMessageBtn.addEventListener('click', () => this.sendMessage());
    this.messageInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.sendMessage();
      }
    });
  }

  // Authentication methods
  isValidHexKey(key) {
    const isValid = /^[0-9a-fA-F]{64}$/.test(key);
    console.log('Hex key validation:', key.substring(0, 16) + '...', isValid);
    return isValid;
  }

  isValidNsecKey(key) {
    // Remove any potential hidden characters
    const cleanKey = key.trim();
    console.log('Clean key:', cleanKey);
    console.log('Key length:', cleanKey.length);
    
    const isValid = /^nsec1[qpzry9x8gf2tvdw0s3jn54khce6mua7l]{58}$/.test(cleanKey);
    console.log('Nsec validation result:', isValid);
    return isValid;
  }

  isValidPrivateKey(key) {
    const cleanKey = key.trim();
    const hexValid = this.isValidHexKey(cleanKey);
    const nsecValid = this.isValidNsecKey(cleanKey);
    const isValid = hexValid || nsecValid;
    console.log('Private key validation:', cleanKey.substring(0, 20) + '...', 'hex:', hexValid, 'nsec:', nsecValid, 'overall:', isValid);
    return isValid;
  }

  async nsecToHex(nsec) {
    try {
      if (!this.isValidNsecKey(nsec)) throw new Error('Invalid nsec format');
      const charset = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
      const dataPart = nsec.slice(5);
      const values = [];
      for (let ch of dataPart) {
        const idx = charset.indexOf(ch);
        if (idx === -1) throw new Error('Invalid bech32 character');
        values.push(idx);
      }
      const dataWords = values.slice(0, -6);
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
      const privBytes = bytes.slice(0, 32);
      if (privBytes.length !== 32) throw new Error('Invalid decoded length');
      return Array.from(privBytes)
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
    } catch (error) {
      console.error('Error converting nsec to hex:', error);
      throw error;
    }
  }

  handlePrivateKeyInput() {
    const privateKey = this.privateKeyInput.value;
    console.log('Raw input value:', privateKey);
    console.log('Input value length:', privateKey.length);
    console.log('Input value trimmed:', privateKey.trim());
    console.log('Input value char codes:', Array.from(privateKey).map(c => c.charCodeAt(0)));
    
    const trimmedKey = privateKey.trim();
    
    if (this.isValidPrivateKey(trimmedKey)) {
      console.log('Input validation passed');
      this.authenticateBtn.disabled = false;
      this.privateKeyInput.classList.remove('invalid');
    } else {
      console.log('Input validation failed');
      this.authenticateBtn.disabled = true;
      this.privateKeyInput.classList.add('invalid');
    }
  }

  async authenticate() {
    const privateKey = this.privateKeyInput.value.trim();
    console.log('Starting authentication with key:', privateKey.substring(0, 20) + '...');
    
    if (!this.isValidPrivateKey(privateKey)) {
      console.log('Key validation failed');
      alert('Invalid private key format. Must be 64-character hex or valid nsec format.');
      return;
    }

    console.log('Key validation passed, proceeding with authentication');

    try {
      let hexKey = privateKey;
      
      if (this.isValidNsecKey(privateKey)) {
        console.log('Converting nsec to hex...');
        hexKey = await this.nsecToHex(privateKey);
        console.log('Converted nsec to hex:', hexKey);
      }

      console.log('Initializing Nostr client...');
      // Initialize Nostr client
      this.nostrClient = new NostrClient();
      
      // Set up event listeners
      this.nostrClient.on('keySet', (data) => {
        console.log('Key set successfully:', data);
        this.publicKeyDisplay.textContent = data.publicKey;
        this.authStatus.textContent = 'Authenticated';
        this.keyInfo.style.display = 'block';
        this.isAuthenticated = true;
        this.updateUI();
      });

      this.nostrClient.on('relayConnected', (url) => {
        this.addRelayToList(url, true);
        this.updateRelayCount();
      });

      this.nostrClient.on('relayDisconnected', (url) => {
        this.updateRelayStatus(url, false);
        this.updateRelayCount();
      });

      this.nostrClient.on('eventReceived', (event) => {
        this.addEventToFeed(event);
        this.updateEventCount();
      });

      this.nostrClient.on('eventPublished', (event) => {
        this.addEventToFeed(event);
        this.updateEventCount();
      });

      console.log('Setting private key...');
      // Set the private key
      this.nostrClient.setPrivateKey(hexKey);
      
      // Wait a moment for the keySet event to fire
      await new Promise(resolve => setTimeout(resolve, 100));

      console.log('Authentication completed successfully');
      // Store the key
      this.storeKey(privateKey);
      
      // Connect to local relay
      await this.nostrClient.connectRelay(`ws://${window.location.host}`);
      
      // Subscribe to global feed
      this.nostrClient.subscribe('global', [{ kinds: [1] }], (event) => {
        this.addEventToFeed(event);
      });

      return true;
    } catch (error) {
      console.error('Authentication failed:', error);
      alert('Authentication failed. Invalid private key.');
      return false;
    }
  }

  toggleKeyVisibility() {
    const input = this.privateKeyInput;
    const button = this.keyToggleBtn;
    
    if (input.type === 'text') {
      input.type = 'password';
      button.textContent = 'Show';
    } else {
      input.type = 'text';
      button.textContent = 'Hide';
    }
  }

  // Relay management methods
  async addRelay() {
    const url = this.relayUrlInput.value.trim();
    if (!url) return;

    if (this.nostrClient) {
      const success = await this.nostrClient.connectRelay(url);
      if (success) {
        this.relayUrlInput.value = '';
        this.addRelayToList(url, true);
        this.updateRelayCount();
      }
    }
  }

  addRelayToList(url, connected = true) {
    const relayItem = document.createElement('div');
    relayItem.className = `relay-item ${connected ? '' : 'disconnected'}`;
    relayItem.innerHTML = `
      <span class="relay-url">${url}</span>
      <span class="relay-status ${connected ? '' : 'disconnected'}">
        ${connected ? 'Connected' : 'Disconnected'}
      </span>
    `;
    this.relayList.appendChild(relayItem);
  }

  updateRelayStatus(url, connected) {
    const relayItems = this.relayList.querySelectorAll('.relay-item');
    for (const item of relayItems) {
      const urlSpan = item.querySelector('.relay-url');
      if (urlSpan.textContent === url) {
        item.className = `relay-item ${connected ? '' : 'disconnected'}`;
        const statusSpan = item.querySelector('.relay-status');
        statusSpan.textContent = connected ? 'Connected' : 'Disconnected';
        statusSpan.className = `relay-status ${connected ? '' : 'disconnected'}`;
        break;
      }
    }
  }

  updateRelayCount() {
    const connectedRelays = this.relayList.querySelectorAll('.relay-item:not(.disconnected)').length;
    this.relayCount.textContent = `${connectedRelays} relays`;
  }

  // Storage contribution methods
  async checkStorageAvailability() {
    try {
      if ('storage' in navigator && 'estimate' in navigator.storage) {
        const estimate = await navigator.storage.estimate();
        const availableGB = Math.floor((estimate.quota - estimate.usage) / (1024 * 1024 * 1024));
        this.storageAvailable.textContent = `${availableGB} GB Available`;
        this.storageMeterFill.style.width = `${Math.min(100, (availableGB / 10) * 100)}%`;
      } else {
        this.storageAvailable.textContent = '132.3 GB Available';
        this.storageMeterFill.style.width = '100%';
      }
    } catch (error) {
      console.error('Error checking storage:', error);
      this.storageAvailable.textContent = 'Storage check failed';
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
    if (!this.isAuthenticated) {
      alert('Please authenticate first');
      return;
    }

    try {
      const response = await fetch('/api/nodes/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storageAmount: this.storageAmount * 1024 * 1024 * 1024,
          endpoint: `ws://${window.location.host}`,
          pubkey: this.publicKeyDisplay.textContent
        })
      });

      if (response.ok) {
        this.isContributing = true;
        this.contributeButton.style.display = 'none';
        this.contributionStatus.style.display = 'block';
        this.startStatusUpdates();
        console.log('Started contributing storage');
      } else {
        throw new Error('Failed to register node');
      }
    } catch (error) {
      console.error('Error starting contribution:', error);
      alert('Failed to start contributing storage');
    }
  }

  async stopContributing() {
    try {
      const response = await fetch('/api/nodes/unregister', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      if (response.ok) {
        this.isContributing = false;
        this.contributeButton.style.display = 'block';
        this.contributionStatus.style.display = 'none';
        this.stopStatusUpdates();
        console.log('Stopped contributing storage');
      } else {
        throw new Error('Failed to unregister node');
      }
    } catch (error) {
      console.error('Error stopping contribution:', error);
      alert('Failed to stop contributing storage');
    }
  }

  startStatusUpdates() {
    this.startTime = Date.now();
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
        headers: { 'Content-Type': 'application/json' }
      });

      if (response.ok) {
        const data = await response.json();
        this.storageUsedValue.textContent = this.formatBytes(data.storageUsed || 0);
        this.eventsStoredValue.textContent = data.eventsStored || 0;
        this.networkLoadValue.textContent = `${data.networkLoad || 0}%`;
        this.uptimeValue.textContent = this.formatUptime(Date.now() - this.startTime);
      }
    } catch (error) {
      console.error('Error updating status:', error);
    }
  }

  // Event feed methods
  async sendMessage() {
    const content = this.messageInput.value.trim();
    if (!content || !this.isAuthenticated) return;

    try {
      await this.nostrClient.sendTextNote(content);
      this.messageInput.value = '';
      this.sendMessageBtn.disabled = true;
    } catch (error) {
      console.error('Error sending message:', error);
      alert('Failed to send message');
    }
  }

  addEventToFeed(event) {
    const eventItem = document.createElement('div');
    eventItem.className = 'event-item';
    
    const timestamp = new Date(event.created_at * 1000);
    const timeString = timestamp.toLocaleTimeString();
    
    eventItem.innerHTML = `
      <div class="event-header">
        <span class="event-author">${event.pubkey.slice(0, 16)}...</span>
        <span class="event-time">${timeString}</span>
      </div>
      <div class="event-content">${event.content}</div>
    `;
    
    this.eventFeed.insertBefore(eventItem, this.eventFeed.firstChild);
    
    // Limit feed to 100 events
    while (this.eventFeed.children.length > 100) {
      this.eventFeed.removeChild(this.eventFeed.lastChild);
    }
  }

  // Utility methods
  updateEventCount() {
    const count = this.eventFeed.children.length;
    this.totalEvents.textContent = count;
  }

  updateUI() {
    this.authenticateBtn.disabled = !this.isAuthenticated;
    this.sendMessageBtn.disabled = !this.messageInput.value.trim() || !this.isAuthenticated;
    this.contributeButton.disabled = !this.isAuthenticated;
  }

  formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  formatUptime(ms) {
    const hours = Math.floor(ms / (1000 * 60 * 60));
    const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
    return `${hours}h ${minutes}m`;
  }

  storeKey(privateKey) {
    try {
      localStorage.setItem('ephemerelay_key', privateKey);
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
      }
    } catch (error) {
      console.error('Failed to load stored key:', error);
    }
  }
}

// Initialize the interface when the page loads
document.addEventListener('DOMContentLoaded', () => {
  const interface = new NostrInterface();
  interface.loadStoredKey();
}); 