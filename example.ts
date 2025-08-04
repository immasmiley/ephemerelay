import { DistributedRelayCoordinator } from './distributed-coordinator.ts';
import { RelayNode, NostrEvent } from './types.ts';
import { loadConfig, validateConfig } from './config.ts';

async function runExample() {
  console.log('🚀 Starting EphemeraRelay Distributed System Example\n');
  
  // Load configuration
  const config = loadConfig();
  if (!validateConfig(config)) {
    console.error('❌ Invalid configuration');
    return;
  }
  
  console.log('✅ Configuration loaded successfully');
  console.log(`📊 Replication factor: ${config.replicationFactor}`);
  console.log(`🔄 Virtual nodes per server: ${config.virtualNodesPerServer}`);
  console.log(`👥 Authorized members: ${config.memberPubkeys.length}\n`);
  
  // Create local node
  const localNode: RelayNode = {
    nodeId: generateNodeId(),
    pubkey: config.memberPubkeys[0],
    endpoint: `ws://localhost:${config.port}`,
    capacity: config.maxStorageCapacity,
    position: 0,
    lastSeen: Date.now(),
    virtualNodes: []
  };
  
  console.log(`🏠 Local node created: ${localNode.nodeId}`);
  console.log(`🔑 Pubkey: ${localNode.pubkey}`);
  console.log(`💾 Capacity: ${localNode.capacity}MB\n`);
  
  // Initialize distributed coordinator
  const coordinator = new DistributedRelayCoordinator(localNode, config.memberPubkeys);
  console.log('🔗 Distributed coordinator initialized\n');
  
  // Create test events
  const testEvents: NostrEvent[] = [
    {
      id: 'event-1',
      kind: 1,
      pubkey: config.memberPubkeys[0],
      content: 'Hello from the distributed relay!',
      tags: [['p', config.memberPubkeys[1]]],
      created_at: Math.floor(Date.now() / 1000),
      sig: 'test-signature-1'
    },
    {
      id: 'event-2',
      kind: 1,
      pubkey: config.memberPubkeys[1],
      content: 'This is a private message',
      tags: [['p', config.memberPubkeys[0]]],
      created_at: Math.floor(Date.now() / 1000),
      sig: 'test-signature-2'
    }
  ];
  
  console.log('📝 Storing test events...\n');
  
  // Store events
  for (const event of testEvents) {
    const stored = await coordinator.storeEvent(event, event.pubkey);
    console.log(`📤 Event ${event.id}: ${stored ? '✅ Stored' : '❌ Failed'}`);
  }
  
  console.log('\n📊 Network Statistics:');
  const stats = coordinator.getNetworkStats();
  console.log(`   Local events: ${stats.localEvents}`);
  console.log(`   Hash ring nodes: ${stats.ringInfo.totalNodes}`);
  console.log(`   Virtual nodes: ${stats.ringInfo.virtualNodes}`);
  console.log(`   Known nodes: ${stats.knownNodes}`);
  console.log(`   Storage used: ${stats.storageStats.storageUsed} bytes`);
  console.log(`   Unique recipients: ${stats.storageStats.uniqueRecipients}\n`);
  
  console.log('🔍 Querying events...\n');
  
  // Query events for each user
  for (const pubkey of config.memberPubkeys.slice(0, 2)) {
    const events = await coordinator.queryEvents(pubkey, []);
    console.log(`👤 User ${pubkey.slice(0, 8)}...: ${events.length} events`);
    
    for (const event of events) {
      console.log(`   📄 ${event.id}: "${event.content}"`);
    }
    console.log('');
  }
  
  console.log('✅ Example completed successfully!');
  console.log('\n🎯 Key Features Demonstrated:');
  console.log('   • Privacy-preserving storage');
  console.log('   • Distributed event distribution');
  console.log('   • Consistent hashing for load balancing');
  console.log('   • Encrypted content storage');
  console.log('   • Recipient-based access control');
}

function generateNodeId(): string {
  const timestamp = Date.now().toString();
  const random = Math.random().toString(36).substring(2);
  return btoa(`${timestamp}:${random}`).replace(/[^a-zA-Z0-9]/g, '').slice(0, 16);
}

// Run the example
runExample().catch(console.error); 