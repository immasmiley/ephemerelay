// Browser-compatible NostrClient
class NostrClient {
  constructor() {
    this.relays = new Map();
    this.subscriptions = new Map();
    this.eventHandlers = new Map();
    this.connectedRelays = new Set();
    this.privateKey = null;
    this.publicKey = null;
    this.eventListeners = new Map();
  }

  on(event, callback) {
    console.log('Adding event listener:', event);
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, []);
    }
    this.eventListeners.get(event).push(callback);
  }

  emit(event, data) {
    console.log('Emitting event:', event, data);
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      listeners.forEach(callback => callback(data));
    }
  }

  setPrivateKey(privateKey) {
    console.log('Setting private key:', privateKey.substring(0, 16) + '...');
    this.privateKey = privateKey;
    
    // Derive public key from private key
    this.publicKey = this.derivePublicKey(privateKey);
    
    // Emit keySet event
    this.emit('keySet', {
      privateKey: this.privateKey,
      publicKey: this.publicKey
    });
  }

  derivePublicKey(privateKey) {
    // Simple hash-based derivation for demo
    // In production, use proper secp256k1 key derivation
    const hash = this.sha256(privateKey);
    return hash.substring(0, 64);
  }

  async connectRelay(url) {
    try {
      console.log('Connecting to relay:', url);
      
      // Create WebSocket connection
      const ws = new WebSocket(url);
      
      ws.onopen = () => {
        console.log('Connected to relay:', url);
        this.relays.set(url, ws);
        this.connectedRelays.add(url);
        this.emit('relayConnected', url);
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          this.handleRelayMessage(url, message);
        } catch (error) {
          console.error('Error parsing relay message:', error);
        }
      };

      ws.onclose = () => {
        console.log('Disconnected from relay:', url);
        this.relays.delete(url);
        this.connectedRelays.delete(url);
        this.emit('relayDisconnected', url);
      };

      ws.onerror = (error) => {
        console.error('WebSocket error for relay:', url, error);
      };

      return true;
    } catch (error) {
      console.error('Error connecting to relay:', url, error);
      return false;
    }
  }

  handleRelayMessage(relayUrl, message) {
    if (Array.isArray(message) && message.length > 0) {
      const [type, ...args] = message;
      
      switch (type) {
        case 'EVENT':
          const [subId, event] = args;
          this.emit('eventReceived', event);
          break;
          
        case 'EOSE':
          const [subscriptionId] = args;
          console.log('End of stored events for subscription:', subscriptionId);
          break;
          
        case 'OK':
          const [eventId, success, reason] = args;
          if (success) {
            console.log('Event published successfully:', eventId);
          } else {
            console.error('Event publish failed:', eventId, reason);
          }
          break;
          
        case 'NOTICE':
          const [notice] = args;
          console.log('Relay notice:', notice);
          break;
      }
    }
  }

  subscribe(subscriptionId, filters, callback) {
    console.log('Subscribing with filters:', filters);
    
    // Store callback
    this.subscriptions.set(subscriptionId, { filters, callback });
    
    // Send subscription to all connected relays
    const message = ['REQ', subscriptionId, ...filters];
    
    for (const [url, ws] of this.relays) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(message));
      }
    }
  }

  async sendTextNote(content) {
    if (!this.privateKey || !this.publicKey) {
      throw new Error('Private key not set');
    }

    const event = {
      kind: 1,
      pubkey: this.publicKey,
      created_at: Math.floor(Date.now() / 1000),
      tags: [],
      content: content
    };

    // Generate event ID (simplified)
    event.id = this.generateEventId(event);
    
    // Sign the event (simplified)
    event.sig = this.signEvent(event);

    console.log('Publishing event:', event);

    // Send to all connected relays
    const message = ['EVENT', event];
    let published = false;

    for (const [url, ws] of this.relays) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(message));
        published = true;
      }
    }

    if (published) {
      this.emit('eventPublished', event);
    }

    return event;
  }

  generateEventId(event) {
    // Simplified event ID generation
    const serialized = JSON.stringify([
      0,
      event.pubkey,
      event.created_at,
      event.kind,
      event.tags,
      event.content
    ]);
    return this.sha256(serialized);
  }

  signEvent(event) {
    // Simplified signing (in production, use proper Schnorr signing)
    const message = this.generateEventId(event);
    return this.sha256(message + this.privateKey);
  }

  sha256(str) {
    // Simple hash function for demo
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(16).padStart(64, '0');
  }

  close() {
    for (const [url, ws] of this.relays) {
      ws.close();
    }
    this.relays.clear();
    this.connectedRelays.clear();
  }
} 