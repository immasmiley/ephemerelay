import { NodeAnnouncement, RelayNode } from "./types.ts";

export class NodeDiscovery {
  private knownNodes: Map<string, RelayNode>;
  private authorizedMembers: Set<string>;
  private lastAnnouncement: Map<string, number>;
  private healthCheckInterval: number;
  private healthCheckTimer: number;

  constructor(authorizedPubkeys: string[], healthCheckInterval = 30000) {
    this.knownNodes = new Map();
    this.authorizedMembers = new Set(authorizedPubkeys);
    this.lastAnnouncement = new Map();
    this.healthCheckInterval = healthCheckInterval;

    console.log(`NodeDiscovery initialized with ${authorizedPubkeys.length} authorized members`);
    
    // Start health checks
    this.healthCheckTimer = setInterval(() => this.checkNodeHealth(), this.healthCheckInterval);
  }

  async announceNode(node: RelayNode): Promise<void> {
    if (!this.authorizedMembers.has(node.pubkey)) {
      throw new Error("Unauthorized node");
    }

    this.knownNodes.set(node.nodeId, node);
    this.lastAnnouncement.set(node.nodeId, Date.now());

    // Broadcast to other nodes
    await this.broadcastAnnouncement({
      nodeId: node.nodeId,
      pubkey: node.pubkey,
      endpoint: node.endpoint,
      capacity: node.capacity,
      timestamp: Date.now()
    });
  }

  async handleAnnouncement(announcement: NodeAnnouncement): Promise<void> {
    if (!this.authorizedMembers.has(announcement.pubkey)) {
      console.warn(`Ignoring announcement from unauthorized node: ${announcement.pubkey}`);
      return;
    }

    const existingNode = this.knownNodes.get(announcement.nodeId);
    if (existingNode && announcement.timestamp <= this.lastAnnouncement.get(announcement.nodeId)!) {
      // Ignore older announcements
      return;
    }

    // Update or add node
    const node: RelayNode = {
      nodeId: announcement.nodeId,
      pubkey: announcement.pubkey,
      endpoint: announcement.endpoint,
      capacity: announcement.capacity,
      position: 0, // Will be assigned by hash ring
      lastSeen: announcement.timestamp,
      virtualNodes: []
    };

    this.knownNodes.set(node.nodeId, node);
    this.lastAnnouncement.set(node.nodeId, announcement.timestamp);
  }

  getActiveNodes(): RelayNode[] {
    const now = Date.now();
    const activeNodes: RelayNode[] = [];

    for (const [nodeId, node] of this.knownNodes) {
      const lastSeen = this.lastAnnouncement.get(nodeId) || 0;
      if (now - lastSeen < this.healthCheckInterval * 2) {
        activeNodes.push(node);
      }
    }

    return activeNodes;
  }

  getNode(nodeId: string): RelayNode | undefined {
    return this.knownNodes.get(nodeId);
  }

  removeNode(nodeId: string): void {
    this.knownNodes.delete(nodeId);
    this.lastAnnouncement.delete(nodeId);
  }

  private async broadcastAnnouncement(announcement: NodeAnnouncement): Promise<void> {
    const activeNodes = this.getActiveNodes();
    
    for (const node of activeNodes) {
      if (node.nodeId !== announcement.nodeId) {
        try {
          const ws = new WebSocket(node.endpoint);
          
          ws.onopen = () => {
            ws.send(JSON.stringify({
              type: "node_announcement",
              data: announcement
            }));
            ws.close();
          };

          ws.onerror = (error) => {
            console.error(`Failed to broadcast to ${node.endpoint}:`, error);
          };
        } catch (error) {
          console.error(`Failed to connect to ${node.endpoint}:`, error);
        }
      }
    }
  }

  private checkNodeHealth(): void {
    const now = Date.now();
    const staleNodes: string[] = [];

    for (const [nodeId, lastSeen] of this.lastAnnouncement) {
      if (now - lastSeen > this.healthCheckInterval * 2) {
        staleNodes.push(nodeId);
      }
    }

    // Remove stale nodes
    for (const nodeId of staleNodes) {
      console.log(`Removing stale node: ${nodeId}`);
      this.removeNode(nodeId);
    }

    console.log(`Discovered ${this.getActiveNodes().length} active nodes`);
  }

  dispose(): void {
    clearInterval(this.healthCheckTimer);
  }
} 