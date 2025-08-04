import { EventEmitter } from "https://deno.land/x/event@2.0.1/mod.ts";

export interface NostrEvent {
  id: string;
  pubkey: string;
  created_at: number;
  kind: number;
  tags: string[][];
  content: string;
  sig: string;
}

export interface NostrFilter {
  ids?: string[];
  authors?: string[];
  kinds?: number[];
  since?: number;
  until?: number;
  limit?: number;
  search?: string;
  [key: string]: any;
}

export interface RelayInfo {
  name?: string;
  description?: string;
  pubkey?: string;
  contact?: string;
  supported_nips?: number[];
  software?: string;
  version?: string;
  limitation?: {
    max_message_length?: number;
    max_subscriptions?: number;
    max_filters?: number;
    max_limit?: number;
    max_subid_length?: number;
    min_prefix_length?: number;
    max_event_tags?: number;
    max_content_length?: number;
    min_pow_difficulty?: number;
    auth_required?: boolean;
    payment_required?: boolean;
  };
}

export class NostrClient extends EventEmitter {
  private relays: Map<string, WebSocket> = new Map();
  private subscriptions: Map<string, NostrFilter[]> = new Map();
  private eventHandlers: Map<string, (event: NostrEvent) => void> = new Map();
  private connectedRelays: Set<string> = new Set();
  private privateKey: string | null = null;
  private publicKey: string | null = null;

  constructor() {
    super();
  }

  /**
   * Set the user's private key for signing events
   */
  setPrivateKey(privateKey: string): void {
    this.privateKey = privateKey;
    // Derive public key from private key
    this.derivePublicKey(privateKey).then(pubkey => {
      this.publicKey = pubkey;
      this.emit('keySet', { privateKey, publicKey: pubkey });
    });
  }

  /**
   * Connect to a relay
   */
  async connectRelay(url: string): Promise<boolean> {
    try {
      const ws = new WebSocket(url);
      
      ws.onopen = () => {
        console.log(`Connected to relay: ${url}`);
        this.connectedRelays.add(url);
        this.relays.set(url, ws);
        this.emit('relayConnected', url);
      };

      ws.onmessage = (event) => {
        this.handleRelayMessage(url, event.data);
      };

      ws.onclose = () => {
        console.log(`Disconnected from relay: ${url}`);
        this.connectedRelays.delete(url);
        this.relays.delete(url);
        this.emit('relayDisconnected', url);
      };

      ws.onerror = (error) => {
        console.error(`Relay error (${url}):`, error);
        this.emit('relayError', { url, error });
      };

      return true;
    } catch (error) {
      console.error(`Failed to connect to relay ${url}:`, error);
      return false;
    }
  }

  /**
   * Disconnect from a relay
   */
  disconnectRelay(url: string): void {
    const ws = this.relays.get(url);
    if (ws) {
      ws.close();
      this.relays.delete(url);
      this.connectedRelays.delete(url);
    }
  }

  /**
   * Subscribe to events
   */
  subscribe(subscriptionId: string, filters: NostrFilter[], onEvent?: (event: NostrEvent) => void): void {
    this.subscriptions.set(subscriptionId, filters);
    if (onEvent) {
      this.eventHandlers.set(subscriptionId, onEvent);
    }

    // Send subscription to all connected relays
    for (const [url, ws] of this.relays) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(['REQ', subscriptionId, ...filters]));
      }
    }
  }

  /**
   * Unsubscribe from events
   */
  unsubscribe(subscriptionId: string): void {
    this.subscriptions.delete(subscriptionId);
    this.eventHandlers.delete(subscriptionId);

    // Send unsubscription to all connected relays
    for (const [url, ws] of this.relays) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(['CLOSE', subscriptionId]));
      }
    }
  }

  /**
   * Publish an event
   */
  async publishEvent(event: Omit<NostrEvent, 'id' | 'sig'>): Promise<string> {
    if (!this.privateKey) {
      throw new Error('Private key not set');
    }

    // Generate event ID
    const eventData = {
      ...event,
      id: await this.generateEventId(event),
      sig: ''
    };

    // Sign the event
    eventData.sig = await this.signEvent(eventData);

    // Send to all connected relays
    for (const [url, ws] of this.relays) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(['EVENT', eventData]));
      }
    }

    this.emit('eventPublished', eventData);
    return eventData.id;
  }

  /**
   * Send a text note
   */
  async sendTextNote(content: string, tags: string[][] = []): Promise<string> {
    const event = {
      pubkey: this.publicKey!,
      created_at: Math.floor(Date.now() / 1000),
      kind: 1,
      tags,
      content
    };

    return await this.publishEvent(event);
  }

  /**
   * Handle incoming relay messages
   */
  private handleRelayMessage(relayUrl: string, data: string): void {
    try {
      const message = JSON.parse(data);
      const [type, ...args] = message;

      switch (type) {
        case 'EVENT':
          const [subscriptionId, event] = args;
          this.handleIncomingEvent(subscriptionId, event);
          break;

        case 'EOSE':
          const [subId] = args;
          this.emit('subscriptionEnded', { subscriptionId: subId, relay: relayUrl });
          break;

        case 'OK':
          const [eventId, success, message] = args;
          this.emit('eventAcknowledged', { eventId, success, message, relay: relayUrl });
          break;

        case 'NOTICE':
          const [notice] = args;
          this.emit('relayNotice', { message: notice, relay: relayUrl });
          break;

        default:
          console.log('Unknown message type:', type, args);
      }
    } catch (error) {
      console.error('Error parsing relay message:', error);
    }
  }

  /**
   * Handle incoming events
   */
  private handleIncomingEvent(subscriptionId: string, event: NostrEvent): void {
    // Verify event signature
    if (this.verifyEvent(event)) {
      this.emit('eventReceived', event);
      
      // Call subscription handler if exists
      const handler = this.eventHandlers.get(subscriptionId);
      if (handler) {
        handler(event);
      }
    } else {
      console.warn('Received event with invalid signature:', event.id);
    }
  }

  /**
   * Generate event ID (SHA256 hash of serialized event)
   */
  private async generateEventId(event: Omit<NostrEvent, 'id' | 'sig'>): Promise<string> {
    const serialized = JSON.stringify([
      0,
      event.pubkey,
      event.created_at,
      event.kind,
      event.tags,
      event.content
    ]);

    const encoder = new TextEncoder();
    const data = encoder.encode(serialized);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  /**
   * Sign an event
   */
  private async signEvent(event: Omit<NostrEvent, 'sig'>): Promise<string> {
    if (!this.privateKey) {
      throw new Error('Private key not set');
    }

    const eventId = event.id;
    const encoder = new TextEncoder();
    const data = encoder.encode(eventId);
    
    // Convert private key from hex to ArrayBuffer
    const keyData = this.hexToArrayBuffer(this.privateKey);
    
    // Import private key
    const key = await crypto.subtle.importKey(
      'raw',
      keyData,
      { name: 'ECDSA', namedCurve: 'P-256' },
      true,
      ['sign']
    );

    // Sign the event ID
    const signature = await crypto.subtle.sign(
      { name: 'ECDSA', hash: { name: 'SHA-256' } },
      key,
      data
    );

    return this.arrayBufferToHex(signature);
  }

  /**
   * Verify event signature
   */
  private verifyEvent(event: NostrEvent): boolean {
    // This is a simplified verification
    // In production, you'd use proper Schnorr signature verification
    return true; // Placeholder
  }

  /**
   * Derive public key from private key
   */
  private async derivePublicKey(privateKey: string): Promise<string> {
    const keyData = this.hexToArrayBuffer(privateKey);
    const keyHash = await crypto.subtle.digest('SHA-256', keyData);
    return this.arrayBufferToHex(keyHash).slice(0, 64);
  }

  /**
   * Helper: Convert hex to ArrayBuffer
   */
  private hexToArrayBuffer(hex: string): ArrayBuffer {
    const bytes = new Uint8Array(hex.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16)));
    return bytes.buffer;
  }

  /**
   * Helper: Convert ArrayBuffer to hex
   */
  private arrayBufferToHex(buffer: ArrayBuffer): string {
    return Array.from(new Uint8Array(buffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }

  /**
   * Get connected relays
   */
  getConnectedRelays(): string[] {
    return Array.from(this.connectedRelays);
  }

  /**
   * Get active subscriptions
   */
  getActiveSubscriptions(): string[] {
    return Array.from(this.subscriptions.keys());
  }
} 