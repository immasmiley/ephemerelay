/**
 * Windows Native Concurrency Manager
 * 
 * Implements Windows-optimized synchronization using memory-based locks
 * with file system validation for atomic operations.
 * Primary Rule Compliant: Tracks operations in PrivacyPreservingStorage
 */

import { exists } from "https://deno.land/std/fs/exists.ts";
import { PrivacyPreservingStorage } from './privacy-storage.ts';
import { NostrEvent, RelayNode } from './types.ts';

interface LockInfo {
    acquiredAt: number;
    processId: number;
    resourceId: string;
    ownerId: string;
}

interface OperationResult<T> {
    success: boolean;
    result?: T;
    error?: string;
    duration: number;
    rollbackPerformed: boolean;
}

export class WindowsNativeConcurrencyManager {
    private readonly lockRegistry = new Map<string, LockInfo>();
    private readonly maxWaitTime = 5000; // 5 seconds
    private readonly storage: PrivacyPreservingStorage;
    private readonly ownerId: string;
    private readonly lockCleanupInterval: number;
    
    constructor() {
        // Primary Rule compliance: Initialize storage
        const localNode: RelayNode = {
            nodeId: 'windows_concurrency_manager',
            url: 'local://windows-concurrency',
            currentConnections: 0,
            maxConnections: 1,
            storageUsed: 0,
            storageCapacity: 1000000,
            position: 0,
            virtualNodes: [0]
        };
        
        this.storage = new PrivacyPreservingStorage(localNode);
        this.ownerId = `wcm_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        // Start periodic cleanup of stale locks
        this.lockCleanupInterval = setInterval(() => {
            this.cleanupStaleLocks();
        }, 10000); // Every 10 seconds
        
        console.log('🔒 Windows Native Concurrency Manager initialized (Primary Rule compliant)');
    }
    
    async executeAtomically<T>(
        resourceId: string, 
        operation: () => Promise<T>
    ): Promise<T> {
        const startTime = Date.now();
        let rollbackPerformed = false;
        
        // Use Windows native approach: memory-based locks + file validation
        const lockKey = `lock_${resourceId}`;
        
        try {
            // Step 1: Memory-based lock acquisition (instant)
            await this.acquireMemoryLock(lockKey, resourceId);
            
            try {
                // Step 2: File-based validation (Windows-safe)
                await this.validateFileSystemState(resourceId);
                
                // Step 3: Execute operation with rollback capability
                const result = await this.executeWithRollback(operation, resourceId);
                
                // Step 4: Log success to Primary Rule storage
                await this.logOperation(resourceId, 'success', Date.now() - startTime);
                
                return result;
                
            } finally {
                // Step 5: Release memory lock
                this.releaseMemoryLock(lockKey);
            }
            
        } catch (error) {
            rollbackPerformed = true;
            
            // Log failure to Primary Rule storage
            await this.logOperation(resourceId, 'failure', Date.now() - startTime, error.message);
            
            throw error;
        }
    }
    
    private async acquireMemoryLock(lockKey: string, resourceId: string): Promise<void> {
        const startTime = Date.now();
        let attempts = 0;
        
        while (Date.now() - startTime < this.maxWaitTime) {
            attempts++;
            
            if (!this.lockRegistry.has(lockKey)) {
                this.lockRegistry.set(lockKey, {
                    acquiredAt: Date.now(),
                    processId: Deno.pid,
                    resourceId,
                    ownerId: this.ownerId
                });
                return;
            }
            
            // Check for stale locks
            const lock = this.lockRegistry.get(lockKey);
            if (lock && Date.now() - lock.acquiredAt > 30000) {
                console.warn(`Cleaning stale lock for ${lockKey}`);
                this.lockRegistry.delete(lockKey);
                continue;
            }
            
            // Windows-optimized micro-sleep with jitter
            const sleepTime = Math.min(1 + Math.random() * 5, 50); // Max 50ms
            await new Promise(resolve => setTimeout(resolve, sleepTime));
        }
        
        throw new Error(`Failed to acquire memory lock for ${lockKey} after ${attempts} attempts`);
    }
    
    private async validateFileSystemState(resourceId: string): Promise<void> {
        // Windows-safe file existence check without locks
        const filePath = `D:\\sphere-storage\\data\\${resourceId}.json`;
        
        try {
            const fileExists = await exists(filePath);
            if (fileExists) {
                // File exists - validate it's not corrupted
                const content = await Deno.readTextFile(filePath);
                JSON.parse(content); // Throws if corrupted
                
                // Additional Windows-specific validation
                const stat = await Deno.stat(filePath);
                if (stat.size === 0) {
                    throw new Error('File exists but is empty');
                }
            }
        } catch (error) {
            if (error instanceof Deno.errors.NotFound) {
                // File doesn't exist - this is OK for new resources
                return;
            }
            
            if (error instanceof SyntaxError) {
                throw new Error(`File corruption detected: ${error.message}`);
            }
            
            throw new Error(`File system validation failed: ${error.message}`);
        }
    }
    
    private async executeWithRollback<T>(
        operation: () => Promise<T>, 
        resourceId: string
    ): Promise<T> {
        const backupPath = `D:\\sphere-storage\\backup\\${resourceId}_${Date.now()}.bak`;
        const filePath = `D:\\sphere-storage\\data\\${resourceId}.json`;
        
        // Ensure directories exist
        await this.ensureDirectoriesExist();
        
        // Create backup if file exists
        let backupCreated = false;
        try {
            if (await exists(filePath)) {
                await Deno.copyFile(filePath, backupPath);
                backupCreated = true;
            }
        } catch (error) {
            console.warn(`Backup creation failed for ${resourceId}: ${error.message}`);
            // Continue without backup - not critical for operation
        }
        
        try {
            const result = await operation();
            
            // Verify operation didn't corrupt the file system
            if (await exists(filePath)) {
                await this.validateFileSystemState(resourceId);
            }
            
            return result;
            
        } catch (error) {
            // Rollback on failure
            if (backupCreated) {
                try {
                    await Deno.copyFile(backupPath, filePath);
                    console.log(`Rollback successful for ${resourceId}`);
                } catch (rollbackError) {
                    console.error(`Rollback failed for ${resourceId}: ${rollbackError.message}`);
                    // Don't throw - original error is more important
                }
            }
            throw error;
        } finally {
            // Cleanup backup
            if (backupCreated) {
                try {
                    await Deno.remove(backupPath);
                } catch (cleanupError) {
                    console.warn(`Backup cleanup failed: ${cleanupError.message}`);
                    // Not critical
                }
            }
        }
    }
    
    private async ensureDirectoriesExist(): Promise<void> {
        const directories = [
            'D:\\sphere-storage',
            'D:\\sphere-storage\\data', 
            'D:\\sphere-storage\\backup'
        ];
        
        for (const dir of directories) {
            try {
                await Deno.mkdir(dir, { recursive: true });
            } catch (error) {
                if (!(error instanceof Deno.errors.AlreadyExists)) {
                    throw error;
                }
            }
        }
    }
    
    private releaseMemoryLock(lockKey: string): void {
        const lock = this.lockRegistry.get(lockKey);
        if (lock && lock.ownerId === this.ownerId) {
            this.lockRegistry.delete(lockKey);
        }
    }
    
    private cleanupStaleLocks(): void {
        const now = Date.now();
        const staleThreshold = 60000; // 1 minute
        
        for (const [lockKey, lock] of this.lockRegistry.entries()) {
            if (now - lock.acquiredAt > staleThreshold) {
                console.warn(`Removing stale lock: ${lockKey}`);
                this.lockRegistry.delete(lockKey);
            }
        }
    }
    
    private async logOperation(
        resourceId: string, 
        status: 'success' | 'failure', 
        duration: number, 
        error?: string
    ): Promise<void> {
        try {
            const operationEvent: NostrEvent = {
                id: `wcm_op_${resourceId}_${Date.now()}`,
                kind: 10815, // Windows concurrency operations
                pubkey: 'windows_concurrency_manager',
                created_at: Math.floor(Date.now() / 1000),
                tags: [
                    ['resource_id', resourceId],
                    ['status', status],
                    ['duration_ms', duration.toString()],
                    ['process_id', Deno.pid.toString()],
                    ['owner_id', this.ownerId]
                ],
                content: JSON.stringify({
                    operation: 'atomic_execution',
                    resourceId,
                    status,
                    duration,
                    processId: Deno.pid,
                    ownerId: this.ownerId,
                    error: error || null,
                    timestamp: Date.now()
                }),
                sig: 'windows_concurrency_signature'
            };
            
            await this.storage.storeEvent(operationEvent);
        } catch (logError) {
            console.warn(`Failed to log operation: ${logError.message}`);
            // Don't throw - logging failure shouldn't break the operation
        }
    }
    
    // Statistics and monitoring
    async getStats(): Promise<{
        activeLocks: number;
        totalOperations: number;
        successfulOperations: number;
        averageDuration: number;
        lockContentionRate: number;
    }> {
        const events = await this.storage.queryEvents('windows_concurrency_manager', [{
            kinds: [10815],
            limit: 1000
        }]);
        
        const successfulOps = events.filter(e => {
            try {
                const content = JSON.parse(e.content);
                return content.status === 'success';
            } catch {
                return false;
            }
        });
        
        const totalDuration = events.reduce((sum, e) => {
            try {
                const content = JSON.parse(e.content);
                return sum + (content.duration || 0);
            } catch {
                return sum;
            }
        }, 0);
        
        return {
            activeLocks: this.lockRegistry.size,
            totalOperations: events.length,
            successfulOperations: successfulOps.length,
            averageDuration: events.length > 0 ? totalDuration / events.length : 0,
            lockContentionRate: events.length > 0 ? 
                (events.length - successfulOps.length) / events.length * 100 : 0
        };
    }
    
    // Cleanup method
    destroy(): void {
        if (this.lockCleanupInterval) {
            clearInterval(this.lockCleanupInterval);
        }
        
        // Release all locks owned by this instance
        for (const [lockKey, lock] of this.lockRegistry.entries()) {
            if (lock.ownerId === this.ownerId) {
                this.lockRegistry.delete(lockKey);
            }
        }
        
        console.log('🔒 Windows Native Concurrency Manager destroyed');
    }
}

// Factory function for Primary Rule compliance
export function createWindowsNativeConcurrencyManager(): WindowsNativeConcurrencyManager {
    return new WindowsNativeConcurrencyManager();
}