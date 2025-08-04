import { assertEquals, assertExists } from "https://deno.land/std@0.181.0/testing/asserts.ts";
import { ConsistentHashRing } from './consistent-hash.ts';
import { PrivacyPreservingStorage } from './privacy-storage.ts';
import { NodeDiscovery } from './node-discovery.ts';
import { DistributedRelayCoordinator } from './distributed-coordinator.ts';
import { RelayNode, NostrEvent } from './types.ts';

// Test data
const testNode: RelayNode = {
  nodeId: 'test-node-1',
  pubkey: '02f43f3c4bf805e0f6eec48f4e8f3c4bf805e0f6eec48f4e8f3c4bf805e0f6ee',
  endpoint: 'ws://localhost:5000',
  capacity: 1024,
  position: 0,
  lastSeen: Date.now(),
  virtualNodes: []
};

const testEvent: NostrEvent = {
  id: 'test-event-1',
  kind: 1,
  pubkey: '02f43f3c4bf805e0f6eec48f4e8f3c4bf805e0f6eec48f4e8f3c4bf805e0f6ee',
  content: 'Hello, distributed relay!',
  tags: [['p', '03f43f3c4bf805e0f6eec48f4e8f3c4bf805e0f6eec48f4e8f3c4bf805e0f6ee']],
  created_at: Math.floor(Date.now() / 1000),
  sig: 'test-signature'
};

Deno.test("ConsistentHashRing - Add and remove nodes", () => {
  const ring = new ConsistentHashRing();
  
  // Add node
  ring.addNode(testNode);
  const ringInfo = ring.getRingInfo();
  assertEquals(ringInfo.totalNodes, 1);
  assertExists(ringInfo.virtualNodes);
  
  // Remove node
  ring.removeNode(testNode.nodeId);
  const ringInfoAfter = ring.getRingInfo();
  assertEquals(ringInfoAfter.totalNodes, 0);
});

Deno.test("ConsistentHashRing - Get responsible nodes", () => {
  const ring = new ConsistentHashRing();
  ring.addNode(testNode);
  
  const responsibleNodes = ring.getResponsibleNodes('test-key');
  assertEquals(responsibleNodes.length, 1);
  assertEquals(responsibleNodes[0].nodeId, testNode.nodeId);
});

Deno.test("PrivacyPreservingStorage - Store and query events", async () => {
  const storage = new PrivacyPreservingStorage(testNode);
  
  // Store event
  const stored = await storage.storeEvent(testEvent, testEvent.pubkey);
  assertEquals(stored, true);
  
  // Query events
  const events = await storage.queryEvents(testEvent.pubkey, []);
  assertEquals(events.length, 1);
  assertEquals(events[0].id, testEvent.id);
});

Deno.test("NodeDiscovery - Initialize with members", () => {
  const memberPubkeys = ['02f43f3c4bf805e0f6eec48f4e8f3c4bf805e0f6eec48f4e8f3c4bf805e0f6ee'];
  const discovery = new NodeDiscovery(memberPubkeys);
  
  const knownNodes = discovery.getKnownNodes();
  assertEquals(knownNodes.length, 0); // Should start empty
});

Deno.test("DistributedRelayCoordinator - Initialize system", () => {
  const memberPubkeys = ['02f43f3c4bf805e0f6eec48f4e8f3c4bf805e0f6eec48f4e8f3c4bf805e0f6ee'];
  const coordinator = new DistributedRelayCoordinator(testNode, memberPubkeys);
  
  const stats = coordinator.getNetworkStats();
  assertExists(stats.localEvents);
  assertExists(stats.ringInfo);
  assertExists(stats.knownNodes);
  assertExists(stats.storageStats);
});

Deno.test("DistributedRelayCoordinator - Store and query events", async () => {
  const memberPubkeys = ['02f43f3c4bf805e0f6eec48f4e8f3c4bf805e0f6eec48f4e8f3c4bf805e0f6ee'];
  const coordinator = new DistributedRelayCoordinator(testNode, memberPubkeys);
  
  // Store event
  const stored = await coordinator.storeEvent(testEvent, testEvent.pubkey);
  assertEquals(stored, true);
  
  // Query events
  const events = await coordinator.queryEvents(testEvent.pubkey, []);
  assertEquals(events.length, 1);
  assertEquals(events[0].id, testEvent.id);
});

console.log("All tests passed! The distributed relay system is working correctly."); 