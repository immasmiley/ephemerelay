import { RelayConfig } from "./types.ts";

// Default configuration
export const DEFAULT_CONFIG: RelayConfig = {
  port: 5001,
  memberPubkeys: [
    // Add your member pubkeys here
    "default-pubkey-1",
    "default-pubkey-2"
  ],
  maxStorageCapacity: 1024, // 1GB in MB
  replicationFactor: 3,
  virtualNodesPerServer: 150
};

export function loadConfig(): RelayConfig {
  try {
    // Try to load from environment variables
    const config: RelayConfig = {
      port: parseInt(Deno.env.get("PORT") || String(DEFAULT_CONFIG.port)),
      memberPubkeys: JSON.parse(Deno.env.get("MEMBER_PUBKEYS") || JSON.stringify(DEFAULT_CONFIG.memberPubkeys)),
      maxStorageCapacity: parseInt(Deno.env.get("MAX_STORAGE_MB") || String(DEFAULT_CONFIG.maxStorageCapacity)),
      replicationFactor: parseInt(Deno.env.get("REPLICATION_FACTOR") || String(DEFAULT_CONFIG.replicationFactor)),
      virtualNodesPerServer: parseInt(Deno.env.get("VIRTUAL_NODES") || String(DEFAULT_CONFIG.virtualNodesPerServer))
    };

    return config;
  } catch (error) {
    console.error("Error loading config:", error);
    return DEFAULT_CONFIG;
  }
}

export function validateConfig(config: RelayConfig): boolean {
  // Basic validation
  if (!config.port || config.port < 1 || config.port > 65535) {
    console.error("Invalid port number");
    return false;
  }

  if (!Array.isArray(config.memberPubkeys) || config.memberPubkeys.length < 1) {
    console.error("At least one member pubkey required");
    return false;
  }

  if (config.maxStorageCapacity < 1) {
    console.error("Storage capacity must be positive");
    return false;
  }

  if (config.replicationFactor < 1) {
    console.error("Replication factor must be positive");
    return false;
  }

  if (config.virtualNodesPerServer < 1) {
    console.error("Virtual nodes per server must be positive");
    return false;
  }

  return true;
} 