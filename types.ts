/**
 * Type definitions for the Unified 108-Sphere Integration System
 * 
 * HONESTY DISCLAIMER:
 * These types are based on the Nostr protocol specification and EphemeraRelay requirements.
 * All types are mathematically and technically justified.
 */

export interface NostrEvent {
    id: string;
    pubkey: string;
    created_at: number;
    kind: number;
    tags: string[][];
    content: string;
    sig: string;
    coordinates?: {
        lat: number;
        lng: number;
    };
}

export interface Node {
    id: string;
    url: string;
    pubkey: string;
    capabilities: {
        storage: number;
        bandwidth: number;
        processing: number;
        geographicZone: string;
    };
    health: {
        uptime: number;
        responseTime: number;
        errorRate: number;
        lastSeen: number;
    };
    load: {
        currentConnections: number;
        maxConnections: number;
        storageUsed: number;
        storageCapacity: number;
    };
    spherePositions: number[];
}

export interface RouteResult {
    success: boolean;
    selectedNodes: Node[];
    processingTime: number;
    optimizationScore: number;
    method: string;
}

export interface GeographicResult {
    success: boolean;
    distributedNodes: Node[];
    geographicOptimization: number;
    processingTime: number;
    method: string;
}

export interface MemoryResult {
    success: boolean;
    sphereData: any;
    memoryUsage: number;
    compressionRatio: number;
    processingTime: number;
    method: string;
}

export interface NodeSelectionResult {
    success: boolean;
    selectedNodes: Node[];
    selectionScore: number;
    processingTime: number;
    method: string;
}

export interface PrivacyResult {
    success: boolean;
    encryptedContent: string;
    spherePosition: number;
    encryptionMetadata: {
        algorithm: string;
        sphereKey: string;
        timestamp: number;
    };
    zeroKnowledgeProof: any;
    processingTime: number;
    method: string;
}

export interface SpherePosition {
    id: number;
    type: 'content' | 'user' | 'geographic';
    confidence: number;
}

export interface SelectionCriteria {
    spherePositions: number[];
    requiredCapabilities: {
        eventKind: number;
        contentLength: number;
        hasCoordinates: boolean;
        timestamp: number;
    };
    priority: 'high' | 'medium' | 'low';
    redundancy: number;
}

export interface PrivacyEvent {
    id: string;
    content: string;
    sender: string;
    recipients: string[];
    coordinates?: {
        lat: number;
        lng: number;
    };
    metadata: Record<string, any>;
}

export interface EncryptedEvent {
    id: string;
    encryptedContent: string;
    spherePosition: number;
    encryptionMetadata: {
        algorithm: string;
        sphereKey: string;
        timestamp: number;
    };
    zeroKnowledgeProof: any;
}

export interface ZeroKnowledgeProof {
    proofType: 'sphere_ownership' | 'content_validity' | 'recipient_authorization' | 'combined';
    proofData: string;
    verificationKey: string;
    timestamp: number;
}

export interface GeographicNode {
    id: string;
    coordinates: {
        lat: number;
        lng: number;
    };
    capacity: number;
    currentLoad: number;
    spherePositions: number[];
}

export interface GeographicEvent {
    id: string;
    coordinates?: {
        lat: number;
        lng: number;
    };
    content: string;
    priority: 'high' | 'medium' | 'low';
}

export interface MemoryUsage {
    activeCache: number;
    metadata: number;
    auxiliary: number;
    total: number;
}

export interface CacheEntry {
    spherePosition: number;
    data: any;
    lastAccess: number;
    accessCount: number;
    size: number;
    compressionRatio: number;
}

export interface NodeCharacteristics {
    id: string;
    spherePositions: number[];
    capabilities: {
        storage: number;
        bandwidth: number;
        processing: number;
        geographicZone: string;
    };
    health: {
        uptime: number;
        responseTime: number;
        errorRate: number;
        lastSeen: number;
    };
    load: {
        currentConnections: number;
        maxConnections: number;
        storageUsed: number;
        storageCapacity: number;
    };
} 