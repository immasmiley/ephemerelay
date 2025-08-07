import { NostrEvent, NostrFilter, EncryptedEvent, StoredEvent, RelayNode } from "./types.ts";
import { ConsistentHashRing } from "./consistent-hash.ts";

export class PrivacyPreservingStorage {
  private hashRing: ConsistentHashRing;
  private localNode: RelayNode;
  private localEvents: Map<string, StoredEvent>;

  constructor(localNode: RelayNode) {
    this.hashRing = new ConsistentHashRing();
    this.localNode = localNode;
    this.localEvents = new Map();
  }

  async storeEvent(event: NostrEvent, senderPubkey: string): Promise<boolean> {
    // Extract recipients from p-tags
    const recipients = event.tags
      .filter(tag => tag[0] === "p" && tag[1])
      .map(tag => tag[1]);

    if (recipients.length === 0) {
      recipients.push(senderPubkey); // Self-message
    }

    // Store event for each recipient on their designated nodes
    const storagePromises = recipients.map(async recipientPubkey => {
      const recipientHash = await this.hash(recipientPubkey);
      const responsibleNodes = this.hashRing.getNodes(recipientHash, 3); // REPLICATION_FACTOR = 3

      // Only store if this node is responsible for this recipient
      const isResponsible = responsibleNodes.some(node => 
        node.nodeId === this.localNode.nodeId
      );

      if (!isResponsible) return false;

      // Create encrypted event for this recipient
      const encryptedEvent: EncryptedEvent = {
        ...event,
        recipientPubkey,
        encryptedContent: await this.encryptForRecipient(event.content, recipientPubkey)
      };

      // Store locally
      const eventId = `${recipientHash}:${event.id}`;
      const storedEvent: StoredEvent = {
        ...encryptedEvent,
        storageId: eventId,
        expiresAt: Date.now() + (7 * 24 * 60 * 60 * 1000), // 7 days
        accessHint: await this.generateAccessHint(recipientPubkey, senderPubkey)
      };

      this.localEvents.set(eventId, storedEvent);

      // Replicate to other responsible nodes
      await this.replicateToNodes(storedEvent, responsibleNodes);

      return true;
    });

    const results = await Promise.all(storagePromises);
    return results.some(success => success);
  }

  async queryEvents(userPubkey: string, filters: NostrFilter[]): Promise<NostrEvent[]> {
    const userHash = await this.hash(userPubkey);

    // Only return events where this user is the recipient
    const userEvents: NostrEvent[] = [];

    for (const [eventId, storedEvent] of this.localEvents) {
      if (!eventId.startsWith(`${userHash}:`)) continue;

      // Decrypt content for authorized user
      try {
        const decryptedContent = await this.decryptForUser(
          storedEvent.encryptedContent,
          userPubkey
        );

        const decryptedEvent: NostrEvent = {
          id: storedEvent.id,
          pubkey: storedEvent.pubkey,
          created_at: storedEvent.created_at,
          kind: storedEvent.kind,
          tags: storedEvent.tags,
          content: decryptedContent,
          sig: storedEvent.sig
        };

        // Apply filters
        if (this.eventMatchesFilters(decryptedEvent, filters)) {
          userEvents.push(decryptedEvent);
        }
      } catch (error) {
        // User cannot decrypt this event - skip silently
        continue;
      }
    }

    return userEvents.sort((a, b) => b.created_at - a.created_at);
  }

  private async encryptForRecipient(content: string, recipientPubkey: string): Promise<string> {
    // TODO: Implement NIP-04 encryption
    // For now, using a simple placeholder encryption
    const encoder = new TextEncoder();
    const data = encoder.encode(content);
    const key = await crypto.subtle.generateKey(
      { name: "AES-GCM", length: 256 },
      true,
      ["encrypt"]
    );
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encrypted = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      data
    );
    
    return btoa(String.fromCharCode(...new Uint8Array(encrypted)));
  }

  private async decryptForUser(encryptedContent: string, userPubkey: string): Promise<string> {
    // TODO: Implement NIP-04 decryption
    // For now, return encrypted content as-is for testing
    return atob(encryptedContent);
  }

  private async generateAccessHint(recipientPubkey: string, senderPubkey: string): Promise<string> {
    // Generate a hint that helps with key derivation without revealing keys
    const combinedPubkeys = recipientPubkey + senderPubkey;
    const encoder = new TextEncoder();
    const data = encoder.encode(combinedPubkeys);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 16);
  }

  private async hash(data: string): Promise<string> {
    const encoder = new TextEncoder();
    const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(data));
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  private eventMatchesFilters(event: NostrEvent, filters: NostrFilter[]): boolean {
    return filters.some(filter => {
      // Check each filter condition
      if (filter.ids && !filter.ids.includes(event.id)) return false;
      if (filter.authors && !filter.authors.includes(event.pubkey)) return false;
      if (filter.kinds && !filter.kinds.includes(event.kind)) return false;
      if (filter.since && event.created_at < filter.since) return false;
      if (filter.until && event.created_at > filter.until) return false;
      return true;
    });
  }

  private async replicateToNodes(event: StoredEvent, nodes: RelayNode[]): Promise<void> {
    // Replicate to other responsible nodes
    const replicationPromises = nodes
      .filter(node => node.nodeId !== this.localNode.nodeId)
      .map(async node => {
        try {
          const ws = new WebSocket(node.endpoint);
          await new Promise((resolve, reject) => {
            ws.onopen = () => {
              ws.send(JSON.stringify({
                type: "replicate",
                event: event
              }));
              ws.close();
              resolve(true);
            };
            ws.onerror = reject;
          });
        } catch (error) {
          console.error(`Failed to replicate to ${node.endpoint}:`, error);
        }
      });

    await Promise.allSettled(replicationPromises);
  }

  getLocalEvents(): Map<string, StoredEvent> {
    return this.localEvents;
  }

  getEventCount(): number {
    return this.localEvents.size;
  }

  /**
   * Alias for getEventCount (method expected by DistributedRelayCoordinator)
   */
  getLocalEventsCount(): number {
    return this.getEventCount();
  }

  /**
   * Get storage statistics (missing method needed by coordinator)
   */
  getStorageStats(): { totalEvents: number; diskUsage: number; compressionRatio: number } {
    return {
      totalEvents: this.getEventCount(),
      diskUsage: this.localEvents.size * 1000, // Estimate based on event count
      compressionRatio: 0.8 // Estimate compression ratio
    };
  }

  cleanup(): void {
    const now = Date.now();
    for (const [eventId, event] of this.localEvents) {
      if (event.expiresAt && event.expiresAt < now) {
        this.localEvents.delete(eventId);
      }
    }
  }
} 