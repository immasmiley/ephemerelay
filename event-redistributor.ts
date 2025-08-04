import { RelayNode, StoredEvent } from "./types.ts";
import { ConsistentHashRing } from "./consistent-hash.ts";
import { PrivacyPreservingStorage } from "./privacy-storage.ts";

export class EventRedistributor {
  private storage: PrivacyPreservingStorage;
  private hashRing: ConsistentHashRing;
  private localNode: RelayNode;

  constructor(storage: PrivacyPreservingStorage, hashRing: ConsistentHashRing, localNode: RelayNode) {
    this.storage = storage;
    this.hashRing = hashRing;
    this.localNode = localNode;
  }

  /**
   * Handle redistribution when a new node joins
   */
  async handleNodeJoin(newNode: RelayNode): Promise<void> {
    console.log(`Redistributing events for new node ${newNode.nodeId}`);

    const eventsToMove = new Map<string, StoredEvent>();
    const localEvents = this.storage.getLocalEvents();

    // Check each event to see if it should move to the new node
    for (const [eventId, event] of localEvents) {
      const [recipientHash] = eventId.split(':');
      const responsibleNodes = this.hashRing.getNodes(recipientHash, 3);
      
      // If new node is responsible but this node isn't, move the event
      const newNodeResponsible = responsibleNodes.some(n => n.nodeId === newNode.nodeId);
      const thisNodeResponsible = responsibleNodes.some(n => n.nodeId === this.localNode.nodeId);

      if (newNodeResponsible && !thisNodeResponsible) {
        eventsToMove.set(eventId, event);
      }
    }

    // Transfer events to new node
    if (eventsToMove.size > 0) {
      await this.transferEvents(eventsToMove, newNode);
      
      // Delete transferred events from local storage
      for (const eventId of eventsToMove.keys()) {
        localEvents.delete(eventId);
      }

      console.log(`Transferred ${eventsToMove.size} events to new node ${newNode.nodeId}`);
    }
  }

  /**
   * Handle redistribution when a node leaves
   */
  async handleNodeLeave(departedNodeId: string): Promise<void> {
    console.log(`Redistributing events after node ${departedNodeId} departure`);

    // Get all events that might need replication
    const localEvents = this.storage.getLocalEvents();
    const eventsToReplicate = new Map<string, StoredEvent>();

    // Check each event's replication status
    for (const [eventId, event] of localEvents) {
      const [recipientHash] = eventId.split(':');
      const responsibleNodes = this.hashRing.getNodes(recipientHash, 3);
      
      // If we're now responsible for this event but weren't before
      const thisNodeResponsible = responsibleNodes.some(n => n.nodeId === this.localNode.nodeId);
      if (thisNodeResponsible) {
        eventsToReplicate.set(eventId, event);
      }
    }

    // Replicate events to maintain desired replication factor
    if (eventsToReplicate.size > 0) {
      await this.replicateEvents(eventsToReplicate);
      console.log(`Replicated ${eventsToReplicate.size} events after node departure`);
    }
  }

  /**
   * Transfer events to a specific node
   */
  private async transferEvents(events: Map<string, StoredEvent>, targetNode: RelayNode): Promise<void> {
    try {
      // Open WebSocket connection to target node
      const ws = new WebSocket(targetNode.endpoint);
      
      await new Promise<void>((resolve, reject) => {
        ws.onopen = async () => {
          try {
            // Send events in batches
            const batchSize = 100;
            const eventArray = Array.from(events.values());
            
            for (let i = 0; i < eventArray.length; i += batchSize) {
              const batch = eventArray.slice(i, i + batchSize);
              
              ws.send(JSON.stringify({
                type: "event_transfer",
                events: batch
              }));

              // Wait for acknowledgment
              await new Promise<void>((ack) => {
                ws.onmessage = (msg) => {
                  const response = JSON.parse(msg.data);
                  if (response.type === "transfer_ack") {
                    ack();
                  }
                };
              });
            }

            ws.close();
            resolve();
          } catch (error) {
            reject(error);
          }
        };

        ws.onerror = reject;
      });
    } catch (error) {
      console.error(`Failed to transfer events to ${targetNode.endpoint}:`, error);
      throw error;
    }
  }

  /**
   * Replicate events to maintain replication factor
   */
  private async replicateEvents(events: Map<string, StoredEvent>): Promise<void> {
    for (const [eventId, event] of events) {
      const [recipientHash] = eventId.split(':');
      const responsibleNodes = this.hashRing.getNodes(recipientHash, 3);
      
      // Remove this node from the list
      const otherNodes = responsibleNodes.filter(n => n.nodeId !== this.localNode.nodeId);
      
      // Replicate to each responsible node
      const replicationPromises = otherNodes.map(node => 
        this.transferEvents(new Map([[eventId, event]]), node)
      );

      try {
        await Promise.all(replicationPromises);
      } catch (error) {
        console.error(`Failed to replicate event ${eventId}:`, error);
      }
    }
  }
} 