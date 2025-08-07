/**
 * SIMPLE ATOMIC FILE OPERATIONS - Primary Rule Compliant
 * 
 * A straightforward implementation of atomic file operations that actually
 * works with the existing PrivacyPreservingStorage system. This provides
 * real race condition protection using file-based locking mechanisms
 * and the existing Primary Rule storage for operation tracking.
 */

import { PrivacyPreservingStorage } from './privacy-storage.ts';
import { NostrEvent, RelayNode } from './types.ts';

interface AtomicOperationResult {
    success: boolean;
    lockId?: string;
    data?: Uint8Array;
    error?: string;
    timestamp: number;
}

export class SimpleAtomicFileOperations {
    private storage: PrivacyPreservingStorage;
    private lockDirectory = 'D:\\temp\\atomic-locks';
    private ownerId: string;

    constructor() {
        // Create a minimal local node for Primary Rule compliance
        const localNode: RelayNode = {
            nodeId: 'atomic_file_ops',
            url: 'local://atomic-operations',
            currentConnections: 0,
            maxConnections: 1,
            storageUsed: 0,
            storageCapacity: 1000000,
            position: 0,
            virtualNodes: [0]
        };

        this.storage = new PrivacyPreservingStorage(localNode);
        this.ownerId = `atomic_ops_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        console.log('🔒 Simple Atomic File Operations initialized');
        console.log(`   Owner ID: ${this.ownerId}`);
        console.log('   Uses Primary Rule PrivacyPreservingStorage for operation tracking');
        console.log('   Uses file-based locking for true atomic operations');
        
        this.initializeLockDirectory();
    }

    private async initializeLockDirectory(): Promise<void> {
        try {
            await Deno.mkdir(this.lockDirectory, { recursive: true });
        } catch (error) {
            if (!(error instanceof Deno.errors.AlreadyExists)) {
                console.error('Failed to create lock directory:', error);
            }
        }
    }

    /**
     * Perform atomic file write with file-based locking
     */
    async atomicWrite(filePath: string, data: Uint8Array): Promise<AtomicOperationResult> {
        const startTime = Date.now();
        const lockId = await this.acquireFileLock(filePath);
        
        if (!lockId) {
            return {
                success: false,
                error: 'Failed to acquire file lock',
                timestamp: startTime
            };
        }

        try {
            // Perform the actual write
            await Deno.writeFile(filePath, data);
            
            // Log operation to Primary Rule storage
            await this.logOperation('write', filePath, data.length);
            
            // Verify write success
            const verification = await this.verifyWrite(filePath, data);
            
            return {
                success: verification.success,
                lockId,
                data: verification.success ? data : undefined,
                error: verification.success ? undefined : verification.error,
                timestamp: startTime
            };
            
        } catch (error) {
            return {
                success: false,
                lockId,
                error: `Atomic write failed: ${error.message}`,
                timestamp: startTime
            };
        } finally {
            await this.releaseFileLock(lockId);
        }
    }

    /**
     * Perform atomic file read with shared locking
     */
    async atomicRead(filePath: string): Promise<AtomicOperationResult> {
        const startTime = Date.now();
        const lockId = await this.acquireSharedLock(filePath);
        
        if (!lockId) {
            return {
                success: false,
                error: 'Failed to acquire shared lock',
                timestamp: startTime
            };
        }

        try {
            const data = await Deno.readFile(filePath);
            
            // Log operation to Primary Rule storage
            await this.logOperation('read', filePath, data.length);
            
            return {
                success: true,
                lockId,
                data,
                timestamp: startTime
            };
            
        } catch (error) {
            return {
                success: false,
                lockId,
                error: `Atomic read failed: ${error.message}`,
                timestamp: startTime
            };
        } finally {
            await this.releaseFileLock(lockId);
        }
    }

    /**
     * Perform atomic append operation (race-condition free)
     */
    async atomicAppend(filePath: string, data: Uint8Array): Promise<AtomicOperationResult> {
        const startTime = Date.now();
        const lockId = await this.acquireFileLock(filePath);
        
        if (!lockId) {
            return {
                success: false,
                error: 'Failed to acquire append lock',
                timestamp: startTime
            };
        }

        try {
            // Read existing content
            let existingData: Uint8Array;
            try {
                existingData = await Deno.readFile(filePath);
            } catch (error) {
                // File doesn't exist yet
                existingData = new Uint8Array(0);
            }
            
            // Combine with new data
            const combinedData = new Uint8Array(existingData.length + data.length);
            combinedData.set(existingData, 0);
            combinedData.set(data, existingData.length);
            
            // Write combined data atomically
            await Deno.writeFile(filePath, combinedData);
            
            // Log operation to Primary Rule storage
            await this.logOperation('append', filePath, data.length);
            
            // Verify append success
            const verification = await this.verifyWrite(filePath, combinedData);
            
            return {
                success: verification.success,
                lockId,
                data: verification.success ? combinedData : undefined,
                error: verification.success ? undefined : verification.error,
                timestamp: startTime
            };
            
        } catch (error) {
            return {
                success: false,
                lockId,
                error: `Atomic append failed: ${error.message}`,
                timestamp: startTime
            };
        } finally {
            await this.releaseFileLock(lockId);
        }
    }

    /**
     * Acquire exclusive file lock using filesystem
     */
    private async acquireFileLock(filePath: string): Promise<string | null> {
        const lockId = `lock_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const lockFile = `${this.lockDirectory}/${this.sanitizeFileName(filePath)}.lock`;
        
        // Try to acquire lock with exponential backoff (more attempts for high contention)
        const maxAttempts = 50; // Increased for race condition tests
        const baseDelay = 5; // 5ms base delay
        
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            try {
                // Try to create lock file exclusively with Windows-friendly approach
                const lockContent = JSON.stringify({
                    lockId,
                    filePath,
                    ownerId: this.ownerId,
                    processId: Deno.pid, // Add process ID for Windows compatibility
                    timestamp: Date.now(),
                    expiresAt: Date.now() + 30000 // 30 seconds
                });
                
                // Use write + create approach that's more Windows-friendly
                try {
                    await Deno.writeFile(lockFile, new TextEncoder().encode(lockContent), {
                        create: true,
                        createNew: true // Atomic creation
                    });
                } catch (createError) {
                    if (createError instanceof Deno.errors.AlreadyExists) {
                        throw createError; // Re-throw as AlreadyExists
                    }
                    // Try alternative approach for Windows compatibility
                    await this.tryAlternativeLockCreation(lockFile, lockContent);
                }
                
                return lockId;
                
            } catch (error) {
                if (error instanceof Deno.errors.AlreadyExists) {
                    // Lock exists, check if it's stale
                    const isStale = await this.isLockStale(lockFile);
                    if (isStale) {
                        await this.removeStaleLock(lockFile);
                        continue; // Retry immediately
                    }
                    
                    // Wait with exponential backoff but cap the delay
                    const exponentialDelay = baseDelay * Math.pow(1.5, attempt); // Slower growth
                    const jitter = Math.random() * 10; // Random jitter
                    const cappedDelay = Math.min(exponentialDelay + jitter, 100); // Cap at 100ms
                    await new Promise(resolve => setTimeout(resolve, cappedDelay));
                } else {
                    console.error(`Lock acquisition failed: ${error.message}`);
                    return null;
                }
            }
        }
        
        return null; // Failed to acquire lock
    }

    /**
     * Try alternative lock creation for Windows compatibility
     */
    private async tryAlternativeLockCreation(lockFile: string, lockContent: string): Promise<void> {
        // Alternative approach: Try to open file with exclusive access
        try {
            // Create the file in a temporary location first
            const tempFile = `${lockFile}.tmp.${Deno.pid}`;
            await Deno.writeFile(tempFile, new TextEncoder().encode(lockContent));
            
            // Try to rename it atomically (Windows atomic operation)
            try {
                await Deno.rename(tempFile, lockFile);
            } catch (renameError) {
                // Clean up temp file
                await Deno.remove(tempFile).catch(() => {});
                throw new Deno.errors.AlreadyExists('Lock file exists');
            }
        } catch (error) {
            throw new Deno.errors.PermissionDenied('Cannot create lock file');
        }
    }

    /**
     * Acquire shared lock (multiple readers allowed)
     */
    private async acquireSharedLock(filePath: string): Promise<string | null> {
        // For simplicity, use the same locking mechanism
        // In a full implementation, this would allow multiple shared locks
        return await this.acquireFileLock(filePath);
    }

    /**
     * Release file lock
     */
    private async releaseFileLock(lockId: string): Promise<void> {
        const lockFiles = await this.findLockFilesByLockId(lockId);
        
        for (const lockFile of lockFiles) {
            try {
                await Deno.remove(lockFile);
            } catch (error) {
                console.error(`Failed to release lock ${lockId}: ${error.message}`);
            }
        }
    }

    /**
     * Check if a lock file is stale
     */
    private async isLockStale(lockFile: string): Promise<boolean> {
        try {
            const lockData = await Deno.readTextFile(lockFile);
            const lockInfo = JSON.parse(lockData);
            
            return Date.now() > lockInfo.expiresAt;
        } catch (error) {
            // If we can't read the lock file, consider it stale
            return true;
        }
    }

    /**
     * Remove a stale lock file
     */
    private async removeStaleLock(lockFile: string): Promise<void> {
        try {
            await Deno.remove(lockFile);
        } catch (error) {
            // Ignore errors - lock might have been removed by another process
        }
    }

    /**
     * Find lock files by lock ID
     */
    private async findLockFilesByLockId(lockId: string): Promise<string[]> {
        const lockFiles: string[] = [];
        
        try {
            for await (const entry of Deno.readDir(this.lockDirectory)) {
                if (entry.isFile && entry.name.endsWith('.lock')) {
                    const lockFile = `${this.lockDirectory}/${entry.name}`;
                    try {
                        const lockData = await Deno.readTextFile(lockFile);
                        const lockInfo = JSON.parse(lockData);
                        
                        if (lockInfo.lockId === lockId) {
                            lockFiles.push(lockFile);
                        }
                    } catch (error) {
                        // Ignore files we can't read
                    }
                }
            }
        } catch (error) {
            console.error(`Failed to scan lock directory: ${error.message}`);
        }
        
        return lockFiles;
    }

    /**
     * Sanitize file path for use as lock file name
     */
    private sanitizeFileName(filePath: string): string {
        return filePath
            .replace(/[^a-zA-Z0-9]/g, '_')
            .replace(/__+/g, '_')
            .replace(/^_|_$/g, '');
    }

    /**
     * Log operation to Primary Rule storage
     */
    private async logOperation(operation: string, filePath: string, dataSize: number): Promise<void> {
        try {
            const operationEvent: NostrEvent = {
                id: `file_op_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                pubkey: this.ownerId,
                created_at: Math.floor(Date.now() / 1000),
                kind: 10810, // Atomic file operation event kind
                tags: [
                    ['operation', operation],
                    ['file_path', filePath],
                    ['data_size', dataSize.toString()],
                    ['timestamp', Date.now().toString()]
                ],
                content: JSON.stringify({
                    operation,
                    filePath,
                    dataSize,
                    ownerId: this.ownerId,
                    timestamp: Date.now()
                }),
                sig: `atomic_op_${operation}_${Date.now()}`
            };

            // Use the actual storage method that exists
            await this.storage.storeEvent(operationEvent, this.ownerId);
        } catch (error) {
            console.error(`Failed to log operation to Primary Rule storage: ${error.message}`);
            // Don't fail the operation if logging fails
        }
    }

    /**
     * Verify write operation success
     */
    private async verifyWrite(filePath: string, expectedData: Uint8Array): Promise<{ success: boolean; error?: string }> {
        try {
            const readBack = await Deno.readFile(filePath);
            
            if (readBack.length !== expectedData.length) {
                return { success: false, error: `Size mismatch: expected ${expectedData.length}, got ${readBack.length}` };
            }

            // Verify content matches
            for (let i = 0; i < expectedData.length; i++) {
                if (readBack[i] !== expectedData[i]) {
                    return { success: false, error: `Content mismatch at byte ${i}` };
                }
            }

            return { success: true };

        } catch (error) {
            return { success: false, error: `Verification failed: ${error.message}` };
        }
    }

    /**
     * Get statistics about file operations
     */
    getOperationStatistics(): {
        ownerId: string;
        lockDirectory: string;
        activeLocks: number;
    } {
        return {
            ownerId: this.ownerId,
            lockDirectory: this.lockDirectory,
            activeLocks: 0 // Would need to scan directory to count
        };
    }

    /**
     * Clean up stale locks
     */
    async cleanupStaleLocks(): Promise<number> {
        let cleaned = 0;
        
        try {
            for await (const entry of Deno.readDir(this.lockDirectory)) {
                if (entry.isFile && entry.name.endsWith('.lock')) {
                    const lockFile = `${this.lockDirectory}/${entry.name}`;
                    
                    if (await this.isLockStale(lockFile)) {
                        await this.removeStaleLock(lockFile);
                        cleaned++;
                    }
                }
            }
        } catch (error) {
            console.error(`Failed to clean up stale locks: ${error.message}`);
        }
        
        return cleaned;
    }
}

// Factory function for Primary Rule compliance
export function createSimpleAtomicFileOperations(): SimpleAtomicFileOperations {
    return new SimpleAtomicFileOperations();
}