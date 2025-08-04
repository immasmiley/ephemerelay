import { RelayNode } from "./types.ts";
import { EventEmitter } from "https://deno.land/x/event@2.0.1/mod.ts";

interface HealthStatus {
  isHealthy: boolean;
  lastCheck: number;
  lastSuccess: number;
  failureCount: number;
  latency: number;
  memoryUsage: number;
  storageUsage: number;
  activeConnections: number;
}

interface HealthConfig {
  checkInterval: number;        // How often to check health (ms)
  failureThreshold: number;     // How many failures before marking unhealthy
  timeoutThreshold: number;     // Timeout for health checks (ms)
  recoveryThreshold: number;    // Successful checks needed for recovery
  maxLatency: number;          // Maximum acceptable latency (ms)
}

export class HealthMonitor extends EventEmitter {
  private nodes: Map<string, RelayNode>;
  private status: Map<string, HealthStatus>;
  private config: HealthConfig;
  private checkInterval: number;
  private localNodeId: string;

  constructor(localNodeId: string, config?: Partial<HealthConfig>) {
    super();
    
    this.nodes = new Map();
    this.status = new Map();
    this.localNodeId = localNodeId;
    
    // Default configuration
    this.config = {
      checkInterval: 30000,     // 30 seconds
      failureThreshold: 3,      // 3 failures
      timeoutThreshold: 5000,   // 5 seconds
      recoveryThreshold: 2,     // 2 successes
      maxLatency: 1000,        // 1 second
      ...config
    };
  }

  /**
   * Start health monitoring
   */
  start(): void {
    // Clear any existing interval
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
    }

    // Start periodic health checks
    this.checkInterval = setInterval(() => {
      this.checkAllNodes();
    }, this.config.checkInterval);

    console.log('Health monitoring started');
  }

  /**
   * Stop health monitoring
   */
  stop(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = 0;
    }
    console.log('Health monitoring stopped');
  }

  /**
   * Add a node to monitor
   */
  addNode(node: RelayNode): void {
    this.nodes.set(node.nodeId, node);
    this.status.set(node.nodeId, {
      isHealthy: true,
      lastCheck: 0,
      lastSuccess: 0,
      failureCount: 0,
      latency: 0,
      memoryUsage: 0,
      storageUsage: 0,
      activeConnections: 0
    });
    
    // Perform immediate health check
    this.checkNodeHealth(node);
  }

  /**
   * Remove a node from monitoring
   */
  removeNode(nodeId: string): void {
    this.nodes.delete(nodeId);
    this.status.delete(nodeId);
  }

  /**
   * Get current health status of a node
   */
  getNodeStatus(nodeId: string): HealthStatus | undefined {
    return this.status.get(nodeId);
  }

  /**
   * Get all healthy nodes
   */
  getHealthyNodes(): RelayNode[] {
    return Array.from(this.nodes.values()).filter(node => 
      this.status.get(node.nodeId)?.isHealthy
    );
  }

  /**
   * Check health of all nodes
   */
  private async checkAllNodes(): Promise<void> {
    const checks = Array.from(this.nodes.values()).map(node => 
      this.checkNodeHealth(node)
    );
    await Promise.all(checks);

    // Emit overall health status
    this.emit('healthUpdate', {
      totalNodes: this.nodes.size,
      healthyNodes: this.getHealthyNodes().length,
      timestamp: Date.now()
    });
  }

  /**
   * Check health of a specific node
   */
  private async checkNodeHealth(node: RelayNode): Promise<void> {
    const status = this.status.get(node.nodeId);
    if (!status) return;

    const startTime = Date.now();
    let isHealthy = false;

    try {
      // Send health check request
      const response = await this.sendHealthCheck(node);
      
      // Update status with response data
      status.latency = Date.now() - startTime;
      status.memoryUsage = response.memoryUsage;
      status.storageUsage = response.storageUsage;
      status.activeConnections = response.activeConnections;

      // Check if response meets health criteria
      isHealthy = this.evaluateHealthResponse(response, status);

      if (isHealthy) {
        status.lastSuccess = Date.now();
        status.failureCount = 0;
        
        // Check if node has recovered
        if (!status.isHealthy && status.failureCount === 0) {
          status.isHealthy = true;
          this.emit('nodeRecovered', node);
        }
      } else {
        this.handleUnhealthyNode(node, status, 'Unhealthy response');
      }
    } catch (error) {
      this.handleUnhealthyNode(node, status, error);
    }

    // Update last check timestamp
    status.lastCheck = Date.now();
    
    // Emit status update
    this.emit('nodeStatus', {
      nodeId: node.nodeId,
      status: { ...status },
      timestamp: Date.now()
    });
  }

  /**
   * Send health check request to a node
   */
  private async sendHealthCheck(node: RelayNode): Promise<any> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeoutThreshold);

    try {
      // Convert ws:// to http:// for health check
      const healthEndpoint = node.endpoint.replace('ws://', 'http://') + '/health';
      
      const response = await fetch(healthEndpoint, {
        signal: controller.signal,
        headers: {
          'X-Node-ID': this.localNodeId
        }
      });

      if (!response.ok) {
        throw new Error(`Health check failed: ${response.status}`);
      }

      return await response.json();
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Evaluate if a health response indicates the node is healthy
   */
  private evaluateHealthResponse(response: any, status: HealthStatus): boolean {
    // Check latency
    if (status.latency > this.config.maxLatency) {
      return false;
    }

    // Check memory usage (>90% is unhealthy)
    if (response.memoryUsage > 90) {
      return false;
    }

    // Check storage usage (>90% is unhealthy)
    if (response.storageUsage > 90) {
      return false;
    }

    // Check if too many connections
    if (response.activeConnections > 1000) { // Configurable limit
      return false;
    }

    return true;
  }

  /**
   * Handle an unhealthy node
   */
  private handleUnhealthyNode(node: RelayNode, status: HealthStatus, error: any): void {
    status.failureCount++;
    console.error(`Health check failed for ${node.nodeId}:`, error);

    // If we've reached the failure threshold, mark as unhealthy
    if (status.failureCount >= this.config.failureThreshold && status.isHealthy) {
      status.isHealthy = false;
      this.emit('nodeFailed', {
        nodeId: node.nodeId,
        failureCount: status.failureCount,
        lastSuccess: status.lastSuccess,
        error: error.message || error
      });
    }
  }

  /**
   * Get overall network health metrics
   */
  getNetworkHealth(): {
    totalNodes: number;
    healthyNodes: number;
    averageLatency: number;
    averageMemoryUsage: number;
    averageStorageUsage: number;
  } {
    const healthyNodes = this.getHealthyNodes();
    const statuses = Array.from(this.status.values());

    return {
      totalNodes: this.nodes.size,
      healthyNodes: healthyNodes.length,
      averageLatency: this.average(statuses.map(s => s.latency)),
      averageMemoryUsage: this.average(statuses.map(s => s.memoryUsage)),
      averageStorageUsage: this.average(statuses.map(s => s.storageUsage))
    };
  }

  private average(numbers: number[]): number {
    if (numbers.length === 0) return 0;
    return numbers.reduce((a, b) => a + b, 0) / numbers.length;
  }
} 