import { EventEmitter } from 'https://deno.land/x/event@2.0.1/mod.ts';
import { verifySignature } from 'npm:nostr-tools@^1.7.4';
import { 
  NostrEvent, 
  NostrFilter, 
  RelayNode, 
  jsonSchema, 
  relayMsgSchema,
  eventSchema 
} from './types.ts';
import { DistributedRelayCoordinator } from './distributed-coordinator.ts';

type Listener = (event: NostrEvent) => void;

export class DistributedRelayHandler {
  private coordinator: DistributedRelayCoordinator;
  private emitter = new EventEmitter<{ event: [NostrEvent] }>(0);
  private BUFFER_TTL = 10000; // 10 sec
  private buffer: {e: NostrEvent, t: number}[] = [];
  
  constructor(coordinator: DistributedRelayCoordinator) {
    this.coordinator = coordinator;
    
    // Start garbage collection
    setInterval(() => this.gc(), 5000);
  }
  
  async handleMessage(socket: WebSocket, data: any): Promise<void> {
    const [type, ...args] = data;
    const user = this.getAuthenticatedUser(socket);
    
    switch (type) {
      case "EVENT":
        const [event] = args;
        await this.handleEvent(event, user);
        break;
        
      case "REQ":
        const [subId, ...filters] = args;
        await this.handleRequest(socket, subId, filters, user);
        break;
        
      case "CLOSE":
        const [subIdToClose] = args;
        this.handleClose(socket, subIdToClose);
        break;
        
      default:
        socket.send(JSON.stringify(['NOTICE', 'invalid: unknown message type']));
    }
  }
  
  private async handleEvent(event: NostrEvent, user: { pubkey: string }): Promise<void> {
    console.log(`Handling EVENT from ${user.pubkey}`);
    
    // Validate event signature
    if (!verifySignature(event)) {
      console.log(`Invalid signature for event ${event.id}`);
      return;
    }
    
    // Extract recipients from p-tags
    const recipients = this.extractRecipients(event);
    const storageNeeded = recipients.some(recipient => 
      this.isNodeResponsible(recipient)
    );
    
    if (storageNeeded) {
      const stored = await this.coordinator.storeEvent(event, user.pubkey);
      console.log(`Event ${event.id} storage result: ${stored}`);
    }
    
    // Always broadcast to network for real-time delivery
    await this.broadcastToRelevantNodes(event, recipients);
    
    // Add to buffer for recent queries
    this.buffer.push({ e: event, t: Date.now() });
    this.gc();
    
    // Emit for subscribers
    this.emitter.emit('event', event);
  }
  
  private async handleRequest(
    socket: WebSocket, 
    subId: string, 
    filters: NostrFilter[], 
    user: { pubkey: string }
  ): Promise<void> {
    console.log(`Handling REQ ${subId} from ${user.pubkey}`);
    
    // Query local storage
    const localEvents = await this.coordinator.queryEvents(user.pubkey, filters);
    
    // Query other responsible nodes if needed
    const remoteEvents = await this.queryRemoteNodes(user.pubkey, filters);
    
    // Combine and deduplicate
    const allEvents = this.deduplicateEvents([...localEvents, ...remoteEvents]);
    
    // Send events to client
    for (const event of allEvents) {
      socket.send(JSON.stringify(["EVENT", subId, event]));
    }
    
    socket.send(JSON.stringify(["EOSE", subId]));
    
    // Set up subscription for future events
    const listener: Listener = (event) => {
      if (this.eventMatchesFilters(event, filters) && 
          this.userCanAccessEvent(event, user.pubkey)) {
        socket.send(JSON.stringify(["EVENT", subId, event]));
      }
    };
    
    this.emitter.on('event', listener);
    
    // Store subscription info
    this.storeSubscription(socket, subId, listener);
  }
  
  private handleClose(socket: WebSocket, subId: string): void {
    console.log(`Closing subscription ${subId}`);
    this.removeSubscription(socket, subId);
  }
  
  private extractRecipients(event: NostrEvent): string[] {
    const recipients = event.tags
      .filter(tag => tag[0] === "p" && tag[1])
      .map(tag => tag[1]);
    
    if (recipients.length === 0) {
      recipients.push(event.pubkey); // Self-message
    }
    
    return recipients;
  }
  
  private isNodeResponsible(recipientPubkey: string): boolean {
    // This would check if this node is responsible for the recipient
    // For now, return true to store all events
    return true;
  }
  
  private async broadcastToRelevantNodes(event: NostrEvent, recipients: string[]): Promise<void> {
    // In a real implementation, this would broadcast to nodes responsible for recipients
    console.log(`Broadcasting event ${event.id} to ${recipients.length} recipients`);
    
    // For now, just emit locally
    this.emitter.emit('event', event);
  }
  
  private async queryRemoteNodes(userPubkey: string, filters: NostrFilter[]): Promise<NostrEvent[]> {
    // This would query other nodes in the distributed network
    // For now, return empty array
    return [];
  }
  
  private deduplicateEvents(events: NostrEvent[]): NostrEvent[] {
    const seen = new Set<string>();
    const unique: NostrEvent[] = [];
    
    for (const event of events) {
      if (!seen.has(event.id)) {
        seen.add(event.id);
        unique.push(event);
      }
    }
    
    return unique.sort((a, b) => b.created_at - a.created_at);
  }
  
  private eventMatchesFilters(event: NostrEvent, filters: NostrFilter[]): boolean {
    // Simple filter matching - in practice use nostr-tools matchFilters
    return filters.every(filter => {
      if (filter.ids && !filter.ids.includes(event.id)) return false;
      if (filter.authors && !filter.authors.includes(event.pubkey)) return false;
      if (filter.kinds && !filter.kinds.includes(event.kind)) return false;
      if (filter.since && event.created_at < filter.since) return false;
      if (filter.until && event.created_at > filter.until) return false;
      return true;
    });
  }
  
  private userCanAccessEvent(event: NostrEvent, userPubkey: string): boolean {
    // Check if user can access this event
    // For now, allow access to own events and public events
    return event.pubkey === userPubkey || event.kind === 1; // Public text notes
  }
  
  private getAuthenticatedUser(socket: WebSocket): { pubkey: string } {
    // In a real implementation, this would extract user authentication
    // For now, return a placeholder
    return { pubkey: 'anonymous' };
  }
  
  private storeSubscription(socket: WebSocket, subId: string, listener: Listener): void {
    // Store subscription mapping
    if (!this.subscriptions) this.subscriptions = new Map();
    if (!this.subscriptions.has(socket)) {
      this.subscriptions.set(socket, new Map());
    }
    
    this.subscriptions.get(socket)!.set(subId, listener);
  }
  
  private removeSubscription(socket: WebSocket, subId: string): void {
    if (!this.subscriptions) return;
    
    const socketSubs = this.subscriptions.get(socket);
    if (socketSubs) {
      const listener = socketSubs.get(subId);
      if (listener) {
        this.emitter.off('event', listener);
        socketSubs.delete(subId);
      }
    }
  }
  
  private gc(): void {
    const minTm = Date.now() - this.BUFFER_TTL;
    while(this.buffer.length > 0) {
      if (this.buffer[0].t >= minTm) break;
      this.buffer.shift();
    }
  }
  
  // Track subscriptions per socket
  private subscriptions?: Map<WebSocket, Map<string, Listener>>;
} 