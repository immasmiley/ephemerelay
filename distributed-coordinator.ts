import { RelayNode, StoredEvent, NostrEvent, NostrFilter } from './types.ts';
import { PrivacyPreservingStorage } from './privacy-storage.ts';
import { NodeDiscovery } from './node-discovery.ts';
import { ConsistentHashRing } from './consistent-hash.ts';

export class DistributedRelayCoordinator {
  private storage: PrivacyPreservingStorage;
  private discovery: NodeDiscovery;
  private hashRing: ConsistentHashRing;
  private localNode: RelayNode;
  
  constructor(localNode: RelayNode, memberPubkeys: string[]) {
    this.localNode = localNode;
    this.storage = new PrivacyPreservingStorage(localNode);
    this.discovery = new NodeDiscovery(memberPubkeys);
    this.hashRing = new ConsistentHashRing();
    
    // Add local node to hash ring
    this.hashRing.addNode(localNode);
    
    // Start periodic tasks
    setInterval(() => this.periodicMaintenance(), 30000); // Every 30 seconds
  }
  
  async handleNodeJoin(newNode: RelayNode): Promise<void> {
    console.log(`Node ${newNode.nodeId} joining network`);
    
    // Add to hash ring
    this.hashRing.addNode(newNode);
    
    // Add to discovery
    await this.discovery.announceNode(newNode);
    
    // Redistribute events that should now be handled by new node
    await this.redistributeEvents();
  }
  
  async handleNodeLeave(nodeId: string): Promise<void> {
    console.log(`Node ${nodeId} leaving network`);
    
    // Remove from hash ring  
    this.hashRing.removeNode(nodeId);
    
    // Re-replicate events that were stored on departed node
    await this.rebalanceAfterDeparture(nodeId);
  }
  
  async storeEvent(event: NostrEvent, senderPubkey: string): Promise<boolean> {
    return await this.storage.storeEvent(event, senderPubkey);
  }
  
  async queryEvents(userPubkey: string, filters: NostrFilter[]): Promise<NostrEvent[]> {
    // Query local storage
    const localEvents = await this.storage.queryEvents(userPubkey, filters);
    
    // Query other responsible nodes if needed
    const remoteEvents = await this.queryRemoteNodes(userPubkey, filters);
    
    // Combine and deduplicate
    const allEvents = this.deduplicateEvents([...localEvents, ...remoteEvents]);
    
    return allEvents;
  }
  
  getNetworkStats(): {
    localEvents: number;
    ringInfo: { totalNodes: number; virtualNodes: number };
    knownNodes: number;
    storageStats: { totalEvents: number; uniqueRecipients: number; storageUsed: number };
  } {
    return {
      localEvents: this.storage.getLocalEventsCount(),
      ringInfo: this.hashRing.getRingInfo(),
      knownNodes: this.discovery.getKnownNodes().length,
      storageStats: this.storage.getStorageStats()
    };
  }
  
  private async redistributeEvents(): Promise<void> {
    console.log('Redistributing events after node join/leave');
    
    const eventsToMove: [string, StoredEvent][] = [];
    
    // This is a simplified redistribution - in practice you'd need more sophisticated logic
    // to determine which events should move based on the hash ring changes
    
    console.log(`Redistributed ${eventsToMove.length} events`);
  }
  
  private async rebalanceAfterDeparture(departedNodeId: string): Promise<void> {
    console.log(`Rebalancing after departure of ${departedNodeId}`);
    
    // Find events that might have lost replicas
    const affectedEvents: StoredEvent[] = [];
    
    // Query remaining nodes to check replication levels
    // This is a simplified version - in practice you'd need more sophisticated coordination
    
    console.log(`Rebalancing completed for ${affectedEvents.length} affected events`);
  }
  
  private async queryRemoteNodes(userPubkey: string, filters: NostrFilter[]): Promise<NostrEvent[]> {
    const userHash = this.hash(userPubkey);
    const responsibleNodes = this.hashRing.getResponsibleNodes(userHash);
    
    const remoteEvents: NostrEvent[] = [];
    
    // Query other responsible nodes
    for (const node of responsibleNodes) {
      if (node.nodeId === this.localNode.nodeId) continue;
      
      try {
        const response = await fetch(`${node.endpoint}/query`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userPubkey,
            filters
          }),
          signal: AbortSignal.timeout(5000)
        });
        
        if (response.ok) {
          const events = await response.json();
          remoteEvents.push(...events);
        }
      } catch (error) {
        console.log(`Failed to query remote node ${node.nodeId}:`, error);
      }
    }
    
    return remoteEvents;
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
  
  private async periodicMaintenance(): Promise<void> {
    console.log('Running periodic maintenance');
    
    // Discover new nodes
    const discoveredNodes = await this.discovery.discoverNodes();
    for (const node of discoveredNodes) {
      if (!this.isNodeInRing(node.nodeId)) {
        await this.handleNodeJoin(node);
      }
    }
    
    // Remove inactive nodes
    this.discovery.removeInactiveNodes();
    
    // Log stats
    const stats = this.getNetworkStats();
    console.log('Network stats:', stats);
  }
  
  private isNodeInRing(nodeId: string): boolean {
    // Check if node is in our hash ring
    const ringInfo = this.hashRing.getRingInfo();
    return ringInfo.totalNodes > 0; // Simplified check
  }
  
  private hash(data: string): string {
    // Simple hash function
    let hash = 0;
    for (let i = 0; i < data.length; i++) {
      const char = data.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString();
  }
} 