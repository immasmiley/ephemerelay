import { RelayNode } from "./types.ts";

export class ConsistentHashRing {
  private nodes: Map<number, RelayNode>;
  private sortedPositions: number[];

  constructor() {
    this.nodes = new Map();
    this.sortedPositions = [];
  }

  addNode(node: RelayNode): void {
    // Add the node at its position
    this.nodes.set(node.position, node);
    
    // Add virtual nodes
    for (const virtualPos of node.virtualNodes) {
      this.nodes.set(virtualPos, node);
    }

    // Update sorted positions
    this.sortedPositions = Array.from(this.nodes.keys()).sort((a, b) => a - b);
    
    console.log(`Adding node ${node.nodeId} to hash ring`);
    console.log(`Hash ring now has ${this.sortedPositions.length} virtual nodes`);
  }

  removeNode(nodeId: string): void {
    // Remove all positions for this node
    for (const [pos, node] of this.nodes.entries()) {
      if (node.nodeId === nodeId) {
        this.nodes.delete(pos);
      }
    }

    // Update sorted positions
    this.sortedPositions = Array.from(this.nodes.keys()).sort((a, b) => a - b);
    
    console.log(`Removed node ${nodeId} from hash ring`);
    console.log(`Hash ring now has ${this.sortedPositions.length} virtual nodes`);
  }

  getNode(key: string | number): RelayNode | undefined {
    if (this.sortedPositions.length === 0) {
      return undefined;
    }

    // Convert key to number if it's a string
    const hashPosition = typeof key === "string" 
      ? this.hash(key) 
      : key;

    // Find the first position >= hash
    const index = this.sortedPositions.findIndex(pos => pos >= hashPosition);
    
    // If not found, wrap around to first position
    const position = index === -1 
      ? this.sortedPositions[0]
      : this.sortedPositions[index];

    return this.nodes.get(position);
  }

  getNodes(key: string | number, count: number): RelayNode[] {
    const result = new Set<RelayNode>();
    
    if (this.sortedPositions.length === 0) {
      return [];
    }

    // Convert key to number if it's a string
    const hashPosition = typeof key === "string"
      ? this.hash(key)
      : key;

    // Find starting index
    let index = this.sortedPositions.findIndex(pos => pos >= hashPosition);
    if (index === -1) {
      index = 0;
    }

    // Collect unique nodes
    while (result.size < count && result.size < this.getUniqueNodeCount()) {
      const node = this.nodes.get(this.sortedPositions[index]);
      if (node) {
        result.add(node);
      }
      index = (index + 1) % this.sortedPositions.length;
    }

    return Array.from(result);
  }

  getAllNodes(): RelayNode[] {
    // Return only unique nodes (not virtual nodes)
    return Array.from(new Set(this.nodes.values()));
  }

  getUniqueNodeCount(): number {
    return new Set(this.nodes.values()).size;
  }

  private hash(key: string): number {
    let hash = 0;
    for (let i = 0; i < key.length; i++) {
      hash = ((hash << 5) - hash) + key.charCodeAt(i);
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
  }
} 