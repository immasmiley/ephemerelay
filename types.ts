import { z } from "https://deno.land/x/zod@v3.20.5/mod.ts";
import { EventEmitter } from "https://deno.land/x/event@2.0.1/mod.ts";

// Basic Nostr types
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
}

export interface RelayInfo {
  url: string;
  connected: boolean;
  lastSeen: number;
}

export type NostrMessage = 
  | ["EVENT", NostrEvent]
  | ["REQ", string, NostrFilter]
  | ["CLOSE", string];

// Encrypted event with recipient info
export interface EncryptedEvent extends NostrEvent {
  recipientPubkey: string;
  encryptedContent: string;
}

// Stored event with metadata
export interface StoredEvent extends EncryptedEvent {
  storageId: string;
  expiresAt?: number;
  accessHint?: string;
}

// Node discovery types
export interface NodeAnnouncement {
  nodeId: string;
  pubkey: string;
  endpoint: string;
  capacity: number;
  timestamp: number;
}

// Configuration types
export interface RelayConfig {
  port: number;
  memberPubkeys: string[];
  maxStorageCapacity: number;  // in MB
  replicationFactor: number;
  virtualNodesPerServer: number;
}

// NostrClient class
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

  setPrivateKey(privateKey: string): void {
    this.privateKey = privateKey;
    this.derivePublicKey(privateKey).then(publicKey => {
      this.publicKey = publicKey;
      this.emit('keySet', { publicKey });
    });
  }

  async connectRelay(url: string): Promise<boolean> {
    try {
      const socket = new WebSocket(url);
      
      socket.onopen = () => {
        this.relays.set(url, socket);
        this.connectedRelays.add(url);
        this.emit('relayConnected', url);
      };

      socket.onmessage = (event) => {
        this.handleRelayMessage(url, event.data);
      };

      socket.onclose = () => {
        this.relays.delete(url);
        this.connectedRelays.delete(url);
        this.emit('relayDisconnected', url);
      };

      socket.onerror = (error) => {
        console.error(`WebSocket error for ${url}:`, error);
        this.relays.delete(url);
        this.connectedRelays.delete(url);
      };

      return true;
    } catch (error) {
      console.error(`Failed to connect to relay ${url}:`, error);
      return false;
    }
  }

  disconnectRelay(url: string): void {
    const socket = this.relays.get(url);
    if (socket) {
      socket.close();
      this.relays.delete(url);
      this.connectedRelays.delete(url);
    }
  }

  subscribe(subscriptionId: string, filters: NostrFilter[], onEvent?: (event: NostrEvent) => void): void {
    this.subscriptions.set(subscriptionId, filters);
    if (onEvent) {
      this.eventHandlers.set(subscriptionId, onEvent);
    }

    const message: NostrMessage = ["REQ", subscriptionId, ...filters];
    this.broadcastToRelays(message);
  }

  unsubscribe(subscriptionId: string): void {
    this.subscriptions.delete(subscriptionId);
    this.eventHandlers.delete(subscriptionId);
    
    const message: NostrMessage = ["CLOSE", subscriptionId];
    this.broadcastToRelays(message);
  }

  async publishEvent(event: Omit<NostrEvent, 'id' | 'sig'>): Promise<string> {
    if (!this.privateKey) {
      throw new Error('Private key not set');
    }

    const eventId = await this.generateEventId(event);
    const signature = await this.signEvent({ ...event, id: eventId });
    
    const completeEvent: NostrEvent = {
      ...event,
      id: eventId,
      sig: signature
    };

    const message: NostrMessage = ["EVENT", completeEvent];
    this.broadcastToRelays(message);
    
    this.emit('eventPublished', completeEvent);
    return eventId;
  }

  async sendTextNote(content: string, tags: string[][] = []): Promise<string> {
    if (!this.privateKey || !this.publicKey) {
      throw new Error('Private key not set');
    }

    const event: Omit<NostrEvent, 'id' | 'sig'> = {
      pubkey: this.publicKey,
      created_at: Math.floor(Date.now() / 1000),
      kind: 1,
      tags,
      content
    };

    return await this.publishEvent(event);
  }

  private handleRelayMessage(relayUrl: string, data: string): void {
    try {
      const message = JSON.parse(data);
      
      if (Array.isArray(message) && message[0] === 'EVENT') {
        const [, subscriptionId, event] = message;
        this.handleIncomingEvent(subscriptionId, event);
      }
    } catch (error) {
      console.error('Error parsing relay message:', error);
    }
  }

  private handleIncomingEvent(subscriptionId: string, event: NostrEvent): void {
    if (this.verifyEvent(event)) {
      this.emit('eventReceived', event);
      
      const handler = this.eventHandlers.get(subscriptionId);
      if (handler) {
        handler(event);
      }
    }
  }

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

  private async signEvent(event: Omit<NostrEvent, 'sig'>): Promise<string> {
    // Simplified signing - in production use proper Schnorr signatures
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

  private verifyEvent(event: NostrEvent): boolean {
    // Simplified verification - in production use proper Schnorr signature verification
    return true;
  }

  private async derivePublicKey(privateKey: string): Promise<string> {
    // Simplified public key derivation - in production use proper secp256k1
    const encoder = new TextEncoder();
    const data = encoder.encode(privateKey);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  private hexToArrayBuffer(hex: string): ArrayBuffer {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) {
      bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
    }
    return bytes.buffer;
  }

  private arrayBufferToHex(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  private broadcastToRelays(message: NostrMessage): void {
    const messageStr = JSON.stringify(message);
    for (const [url, socket] of this.relays) {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(messageStr);
      }
    }
  }

  getConnectedRelays(): string[] {
    return Array.from(this.connectedRelays);
  }

  getActiveSubscriptions(): string[] {
    return Array.from(this.subscriptions.keys());
  }
}

// Zod schemas for validation
export const eventSchema = z.object({
  id: z.string(),
  pubkey: z.string(),
  created_at: z.number(),
  kind: z.number(),
  tags: z.array(z.array(z.string())),
  content: z.string(),
  sig: z.string()
});

export const filterSchema = z.object({
  ids: z.array(z.string()).optional(),
  authors: z.array(z.string()).optional(),
  kinds: z.array(z.number()).optional(),
  since: z.number().optional(),
  until: z.number().optional(),
  limit: z.number().optional()
});

export const messageSchema = z.union([
  z.tuple([z.literal("EVENT"), eventSchema]),
  z.tuple([z.literal("REQ"), z.string(), filterSchema]),
  z.tuple([z.literal("CLOSE"), z.string()])
]);

// Node types
export interface RelayNode {
  nodeId: string;
  pubkey: string;
  endpoint: string;
  capacity: number;
  position: number;
  lastSeen: number;
  virtualNodes: number[];
} 