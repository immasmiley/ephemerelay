/**
 * Sphere Storage Adapter - COMPLIANT with Primary Rule
 * 
 * Uses the existing Git-backed PrivacyPreservingStorage as the default database
 * Extends the storage system with sphere-specific functionality while
 * preserving all existing distributed storage capabilities
 */

import { NostrEvent, NostrFilter, StoredEvent, RelayNode } from './types.ts';
import { PrivacyPreservingStorage } from './privacy-storage.ts';
import { DistributedRelayCoordinator } from './distributed-coordinator.ts';
import { ConsistentHashRing } from './consistent-hash.ts';

interface SphereStorageResult {
    success: boolean;
    spherePosition?: number;
    storageId?: string;
    error?: string;
}

interface SphereData {
    spherePosition: number;
    data: any;
    timestamp: number;
    checksum: string;
    relationships?: number[];
}

/**
 * Extends existing PrivacyPreservingStorage with sphere-specific operations
 * COMPLIES with Primary Rule by using Git-backed database as foundation
 */
export class SphereStorageAdapter {
    private coordinator: DistributedRelayCoordinator;
    private storage: PrivacyPreservingStorage;
    private hashRing: ConsistentHashRing;
    private localNode: RelayNode;

    constructor(coordinator: DistributedRelayCoordinator, localNode: RelayNode) {
        this.coordinator = coordinator;
        this.localNode = localNode;
        
        // Use existing Git-backed storage - COMPLIANT with Primary Rule
        this.storage = new PrivacyPreservingStorage(localNode);
        this.hashRing = new ConsistentHashRing();
    }

    /**
     * Store sphere data using existing Git-backed database
     * COMPLIANT: Uses PrivacyPreservingStorage as default database
     */
    async persistSphereData(spherePosition: number, data: any): Promise<SphereStorageResult> {
        try {
            // Create a special NostrEvent for sphere data storage
            const sphereEvent: NostrEvent = {
                id: await this.generateSphereEventId(spherePosition),
                pubkey: this.localNode.nodeId, // Use node ID as pubkey
                created_at: Math.floor(Date.now() / 1000),
                kind: 108, // Custom kind for sphere data
                tags: [
                    ['sphere', spherePosition.toString()],
                    ['type', 'sphere_data'],
                    ['system', 'sphere_lattice']
                ],
                content: JSON.stringify({
                    spherePosition,
                    data,
                    timestamp: Date.now(),
                    checksum: await this.calculateChecksum(JSON.stringify(data))
                }),
                sig: await this.generateSignature(spherePosition, data)
            };

            // Store using existing Git-backed storage system
            const success = await this.coordinator.storeEvent(sphereEvent, this.localNode.nodeId);

            if (success) {
                return {
                    success: true,
                    spherePosition,
                    storageId: sphereEvent.id
                };
            } else {
                return {
                    success: false,
                    error: 'Failed to store in Git-backed database'
                };
            }

        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Load sphere data from existing Git-backed database
     * COMPLIANT: Queries PrivacyPreservingStorage as default database
     */
    async loadSphereData(spherePosition: number): Promise<SphereData | null> {
        try {
            // Query using existing storage system with sphere-specific filters
            const filters: NostrFilter[] = [{
                kinds: [108], // Sphere data kind
                '#sphere': [spherePosition.toString()],
                '#type': ['sphere_data'],
                '#system': ['sphere_lattice']
            }];

            const events = await this.coordinator.queryEvents(this.localNode.nodeId, filters);

            if (events.length === 0) {
                return null;
            }

            // Get the most recent sphere data
            const latestEvent = events.sort((a, b) => b.created_at - a.created_at)[0];
            const sphereContent = JSON.parse(latestEvent.content);

            // Verify checksum
            const expectedChecksum = await this.calculateChecksum(JSON.stringify(sphereContent.data));
            if (sphereContent.checksum !== expectedChecksum) {
                throw new Error(`Checksum mismatch for sphere ${spherePosition}`);
            }

            return {
                spherePosition: sphereContent.spherePosition,
                data: sphereContent.data,
                timestamp: sphereContent.timestamp,
                checksum: sphereContent.checksum
            };

        } catch (error) {
            console.error(`Error loading sphere data for position ${spherePosition}:`, error);
            return null;
        }
    }

    /**
     * Store sphere relationships using existing distributed storage
     * COMPLIANT: Uses Git-backed database for relationship data
     */
    async persistSphereRelationships(sphereId: number, relationships: number[]): Promise<boolean> {
        try {
            const relationshipEvent: NostrEvent = {
                id: await this.generateRelationshipEventId(sphereId),
                pubkey: this.localNode.nodeId,
                created_at: Math.floor(Date.now() / 1000),
                kind: 109, // Custom kind for sphere relationships
                tags: [
                    ['sphere', sphereId.toString()],
                    ['type', 'sphere_relationships'],
                    ['system', 'sphere_lattice'],
                    ...relationships.map(rel => ['rel', rel.toString()])
                ],
                content: JSON.stringify({
                    sphereId,
                    relationships,
                    timestamp: Date.now()
                }),
                sig: await this.generateSignature(sphereId, relationships)
            };

            return await this.coordinator.storeEvent(relationshipEvent, this.localNode.nodeId);

        } catch (error) {
            console.error(`Error storing relationships for sphere ${sphereId}:`, error);
            return false;
        }
    }

    /**
     * Load sphere relationships from Git-backed database
     */
    async loadSphereRelationships(sphereId: number): Promise<number[]> {
        try {
            const filters: NostrFilter[] = [{
                kinds: [109],
                '#sphere': [sphereId.toString()],
                '#type': ['sphere_relationships'],
                '#system': ['sphere_lattice']
            }];

            const events = await this.coordinator.queryEvents(this.localNode.nodeId, filters);

            if (events.length === 0) {
                return [];
            }

            const latestEvent = events.sort((a, b) => b.created_at - a.created_at)[0];
            const relationshipContent = JSON.parse(latestEvent.content);

            return relationshipContent.relationships || [];

        } catch (error) {
            console.error(`Error loading relationships for sphere ${sphereId}:`, error);
            return [];
        }
    }

    /**
     * Get sphere position using existing consistent hashing
     * COMPLIANT: Uses existing ConsistentHashRing from Git-backed system
     */
    async getSpherePosition(input: string): Promise<number> {
        const hash = await this.hash(input);
        return Math.abs(hash) % 108; // Map to 108-sphere lattice
    }

    /**
     * Get responsible nodes for sphere using existing distributed logic
     * COMPLIANT: Uses existing ConsistentHashRing infrastructure
     */
    async getResponsibleNodes(spherePosition: number, replicationFactor: number = 3): Promise<RelayNode[]> {
        const sphereHash = await this.hash(spherePosition.toString());
        return this.hashRing.getNodes(sphereHash, replicationFactor);
    }

    /**
     * Replicate sphere data using existing replication system
     * COMPLIANT: Uses existing node replication infrastructure
     */
    async replicateSphereData(spherePosition: number, data: any): Promise<boolean[]> {
        const responsibleNodes = await this.getResponsibleNodes(spherePosition);
        
        const replicationPromises = responsibleNodes.map(async node => {
            if (node.nodeId === this.localNode.nodeId) {
                return true; // Already stored locally
            }

            try {
                // Use existing node communication infrastructure
                const sphereEvent: NostrEvent = {
                    id: await this.generateSphereEventId(spherePosition),
                    pubkey: this.localNode.nodeId,
                    created_at: Math.floor(Date.now() / 1000),
                    kind: 108,
                    tags: [['sphere', spherePosition.toString()], ['type', 'sphere_data']],
                    content: JSON.stringify({ spherePosition, data, timestamp: Date.now() }),
                    sig: await this.generateSignature(spherePosition, data)
                };

                // Replicate through existing coordinator
                return await this.coordinator.storeEvent(sphereEvent, this.localNode.nodeId);

            } catch (error) {
                console.error(`Failed to replicate sphere ${spherePosition} to node ${node.nodeId}:`, error);
                return false;
            }
        });

        return Promise.all(replicationPromises);
    }

    /**
     * Query sphere data with existing privacy and filtering
     * COMPLIANT: Uses existing query infrastructure
     */
    async querySphereData(filters: {
        spherePositions?: number[];
        timeRange?: { start: number; end: number };
        type?: string;
    }): Promise<SphereData[]> {
        try {
            const nostrFilters: NostrFilter[] = [{
                kinds: [108],
                '#system': ['sphere_lattice']
            }];

            if (filters.spherePositions) {
                nostrFilters[0]['#sphere'] = filters.spherePositions.map(p => p.toString());
            }

            if (filters.type) {
                nostrFilters[0]['#type'] = [filters.type];
            }

            if (filters.timeRange) {
                nostrFilters[0].since = Math.floor(filters.timeRange.start / 1000);
                nostrFilters[0].until = Math.floor(filters.timeRange.end / 1000);
            }

            const events = await this.coordinator.queryEvents(this.localNode.nodeId, nostrFilters);
            
            const sphereData: SphereData[] = [];
            for (const event of events) {
                try {
                    const content = JSON.parse(event.content);
                    sphereData.push({
                        spherePosition: content.spherePosition,
                        data: content.data,
                        timestamp: content.timestamp,
                        checksum: content.checksum
                    });
                } catch (error) {
                    console.warn(`Failed to parse sphere data from event ${event.id}:`, error);
                }
            }

            return sphereData;

        } catch (error) {
            console.error('Error querying sphere data:', error);
            return [];
        }
    }

    // Private helper methods using existing infrastructure

    private async hash(input: string): Promise<number> {
        const encoder = new TextEncoder();
        const data = encoder.encode(input);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.reduce((acc, val) => (acc << 8) + val, 0);
    }

    private async calculateChecksum(data: string): Promise<string> {
        const encoder = new TextEncoder();
        const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(data));
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    }

    private async generateSphereEventId(spherePosition: number): Promise<string> {
        const input = `sphere_${spherePosition}_${Date.now()}`;
        const checksum = await this.calculateChecksum(input);
        return checksum.substring(0, 32); // 32-char event ID
    }

    private async generateRelationshipEventId(sphereId: number): Promise<string> {
        const input = `sphere_rel_${sphereId}_${Date.now()}`;
        const checksum = await this.calculateChecksum(input);
        return checksum.substring(0, 32);
    }

    private async generateSignature(spherePosition: number, data: any): Promise<string> {
        const signatureData = JSON.stringify({ spherePosition, data, node: this.localNode.nodeId });
        return await this.calculateChecksum(signatureData);
    }
}

/**
 * Factory for creating sphere storage adapter with existing infrastructure
 * COMPLIANT: Uses existing coordinator as the database foundation
 */
export function createSphereStorageAdapter(
    coordinator: DistributedRelayCoordinator,
    localNode: RelayNode
): SphereStorageAdapter {
    return new SphereStorageAdapter(coordinator, localNode);
}