/**
 * ENHANCED DISK VERIFICATION - Primary Rule Compliant
 * 
 * Provides accurate disk usage measurement and external verification
 * using the Git-backed SphereOS database and real file system operations.
 */

import { PrivacyPreservingStorage } from './privacy-storage.ts';
import { NostrEvent, RelayNode } from './types.ts';

interface DiskUsageMetrics {
    beforeOperation: DiskStats;
    afterOperation: DiskStats;
    actualChange: number;
    expectedChange: number;
    accuracy: number; // Percentage accuracy
    verificationPassed: boolean;
}

interface DiskStats {
    totalBytes: number;
    freeBytes: number;
    usedBytes: number;
    timestamp: number;
}

interface FileOperationRecord {
    filePath: string;
    operation: 'create' | 'modify' | 'delete';
    sizeChange: number;
    timestamp: number;
    checksum: string;
    verified: boolean;
}

export class EnhancedDiskVerification {
    private storage: PrivacyPreservingStorage;
    private baseTestPath: string;
    private operationRecords: Map<string, FileOperationRecord> = new Map();

    constructor(baseTestPath: string) {
        // Create a minimal local node for Primary Rule compliance
        const localNode: RelayNode = {
            nodeId: 'disk_verifier',
            url: 'local://disk-verification',
            currentConnections: 0,
            maxConnections: 1,
            storageUsed: 0,
            storageCapacity: 1000000,
            position: 0,
            virtualNodes: [0]
        };

        this.storage = new PrivacyPreservingStorage(localNode);
        this.baseTestPath = baseTestPath;
        
        console.log('💾 Enhanced Disk Verification initialized');
        console.log(`   Base path: ${baseTestPath}`);
        console.log('   Uses Primary Rule PrivacyPreservingStorage for operation tracking');
    }

    /**
     * Measure disk usage before operation
     */
    async measureDiskUsageBefore(): Promise<DiskStats> {
        const stats = await this.getCurrentDiskStats();
        
        // Store baseline measurement in Primary Rule storage
        const baselineEvent: NostrEvent = {
            id: `disk_baseline_${Date.now()}`,
            pubkey: 'disk_verifier',
            created_at: Math.floor(Date.now() / 1000),
            kind: 10807, // Disk measurement event kind
            tags: [
                ['measurement_type', 'baseline'],
                ['test_path', this.baseTestPath],
                ['total_bytes', stats.totalBytes.toString()],
                ['free_bytes', stats.freeBytes.toString()],
                ['used_bytes', stats.usedBytes.toString()]
            ],
            content: JSON.stringify(stats),
            sig: `disk_baseline_${stats.timestamp}`
        };

        await this.storage.storeEvent(baselineEvent);
        return stats;
    }

    /**
     * Measure disk usage after operation and calculate accuracy
     */
    async measureDiskUsageAfter(beforeStats: DiskStats, expectedChange: number): Promise<DiskUsageMetrics> {
        const afterStats = await this.getCurrentDiskStats();
        const actualChange = beforeStats.freeBytes - afterStats.freeBytes;
        
        // Calculate accuracy percentage
        const accuracy = expectedChange === 0 ? 100 : 
                        Math.max(0, 100 - Math.abs((actualChange - expectedChange) / expectedChange) * 100);
        
        const verificationPassed = accuracy >= 90; // 90% accuracy threshold

        const metrics: DiskUsageMetrics = {
            beforeOperation: beforeStats,
            afterOperation: afterStats,
            actualChange,
            expectedChange,
            accuracy,
            verificationPassed
        };

        // Store verification result in Primary Rule storage
        const verificationEvent: NostrEvent = {
            id: `disk_verification_${Date.now()}`,
            pubkey: 'disk_verifier',
            created_at: Math.floor(Date.now() / 1000),
            kind: 10808, // Disk verification event kind
            tags: [
                ['measurement_type', 'verification'],
                ['test_path', this.baseTestPath],
                ['actual_change', actualChange.toString()],
                ['expected_change', expectedChange.toString()],
                ['accuracy', accuracy.toFixed(2)],
                ['passed', verificationPassed.toString()]
            ],
            content: JSON.stringify(metrics),
            sig: `disk_verification_${afterStats.timestamp}`
        };

        await this.storage.storeEvent(verificationEvent);
        return metrics;
    }

    /**
     * Record file operation for tracking
     */
    async recordFileOperation(
        filePath: string, 
        operation: 'create' | 'modify' | 'delete', 
        data?: Uint8Array
    ): Promise<FileOperationRecord> {
        const sizeChange = operation === 'delete' ? -(await this.getFileSize(filePath)) :
                          data ? data.length : 0;
        
        const checksum = data ? await this.calculateSHA256(data) : 
                        operation !== 'delete' ? await this.calculateFileChecksum(filePath) : '';

        const record: FileOperationRecord = {
            filePath,
            operation,
            sizeChange,
            timestamp: Date.now(),
            checksum,
            verified: false
        };

        // Store operation record in Primary Rule storage
        const operationEvent: NostrEvent = {
            id: `file_op_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            pubkey: 'file_operator',
            created_at: Math.floor(Date.now() / 1000),
            kind: 10809, // File operation event kind
            tags: [
                ['file_path', filePath],
                ['operation', operation],
                ['size_change', sizeChange.toString()],
                ['checksum', checksum]
            ],
            content: JSON.stringify(record),
            sig: `file_op_${record.timestamp}`
        };

        await this.storage.storeEvent(operationEvent);
        this.operationRecords.set(filePath, record);

        // Verify operation immediately
        await this.verifyFileOperation(record);
        
        return record;
    }

    /**
     * Verify file operation was successful
     */
    async verifyFileOperation(record: FileOperationRecord): Promise<boolean> {
        try {
            switch (record.operation) {
                case 'create':
                case 'modify':
                    // Verify file exists and has correct checksum
                    const fileExists = await this.fileExists(record.filePath);
                    if (!fileExists) return false;

                    const actualChecksum = await this.calculateFileChecksum(record.filePath);
                    const checksumMatch = actualChecksum === record.checksum;
                    
                    record.verified = checksumMatch;
                    return checksumMatch;

                case 'delete':
                    // Verify file no longer exists
                    const stillExists = await this.fileExists(record.filePath);
                    record.verified = !stillExists;
                    return !stillExists;

                default:
                    return false;
            }
        } catch (error) {
            console.error(`File operation verification failed: ${error.message}`);
            return false;
        }
    }

    /**
     * Get current disk statistics using multiple methods for accuracy
     */
    private async getCurrentDiskStats(): Promise<DiskStats> {
        try {
            // Method 1: Try to get actual disk stats for the drive
            const driveInfo = await this.getDriveInfo();
            
            if (driveInfo.totalBytes > 0) {
                return {
                    totalBytes: driveInfo.totalBytes,
                    freeBytes: driveInfo.freeBytes,
                    usedBytes: driveInfo.totalBytes - driveInfo.freeBytes,
                    timestamp: Date.now()
                };
            }

            // Method 2: Fallback to directory size calculation
            return await this.getDirectoryStats();

        } catch (error) {
            console.error(`Disk stats calculation failed: ${error.message}`);
            
            // Method 3: Final fallback to estimated stats
            return {
                totalBytes: 1000000000000, // 1TB estimate
                freeBytes: 500000000000,   // 500GB estimate
                usedBytes: 500000000000,   // 500GB estimate
                timestamp: Date.now()
            };
        }
    }

    /**
     * Get drive information using Windows fsutil or equivalent
     */
    private async getDriveInfo(): Promise<{ totalBytes: number; freeBytes: number }> {
        try {
            // Extract drive letter from path
            const driveLetter = this.baseTestPath.charAt(0);
            
            // Use fsutil to get accurate disk information on Windows
            const command = new Deno.Command('fsutil', {
                args: ['volume', 'diskfree', `${driveLetter}:`],
                stdout: 'piped',
                stderr: 'piped'
            });

            const { stdout, stderr, success } = await command.output();

            if (success) {
                const output = new TextDecoder().decode(stdout);
                const lines = output.split('\n');
                
                // Parse fsutil output
                let freeBytes = 0;
                let totalBytes = 0;

                for (const line of lines) {
                    if (line.includes('Total # of free bytes')) {
                        const match = line.match(/:\s*(\d+)/);
                        if (match) freeBytes = parseInt(match[1]);
                    }
                    if (line.includes('Total # of bytes')) {
                        const match = line.match(/:\s*(\d+)/);
                        if (match) totalBytes = parseInt(match[1]);
                    }
                }

                if (totalBytes > 0 && freeBytes > 0) {
                    return { totalBytes, freeBytes };
                }
            }

            // If fsutil fails, try PowerShell
            return await this.getPowerShellDriveInfo(driveLetter);

        } catch (error) {
            console.error(`Drive info retrieval failed: ${error.message}`);
            return { totalBytes: 0, freeBytes: 0 };
        }
    }

    /**
     * Get drive info using PowerShell as fallback
     */
    private async getPowerShellDriveInfo(driveLetter: string): Promise<{ totalBytes: number; freeBytes: number }> {
        try {
            const psCommand = `Get-WmiObject -Class Win32_LogicalDisk | Where-Object {$_.DeviceID -eq '${driveLetter}:'} | Select-Object Size,FreeSpace`;
            
            const command = new Deno.Command('powershell', {
                args: ['-Command', psCommand],
                stdout: 'piped',
                stderr: 'piped'
            });

            const { stdout, success } = await command.output();

            if (success) {
                const output = new TextDecoder().decode(stdout);
                // Parse PowerShell output for Size and FreeSpace
                const sizeMatch = output.match(/Size\s*:\s*(\d+)/);
                const freeMatch = output.match(/FreeSpace\s*:\s*(\d+)/);

                if (sizeMatch && freeMatch) {
                    return {
                        totalBytes: parseInt(sizeMatch[1]),
                        freeBytes: parseInt(freeMatch[1])
                    };
                }
            }

            return { totalBytes: 0, freeBytes: 0 };

        } catch (error) {
            console.error(`PowerShell drive info failed: ${error.message}`);
            return { totalBytes: 0, freeBytes: 0 };
        }
    }

    /**
     * Get directory statistics as fallback
     */
    private async getDirectoryStats(): Promise<DiskStats> {
        let totalSize = 0;
        
        try {
            // Calculate total size of test directory
            totalSize = await this.calculateDirectorySize(this.baseTestPath);
        } catch (error) {
            console.error(`Directory size calculation failed: ${error.message}`);
        }

        return {
            totalBytes: totalSize * 100, // Estimate total as 100x current usage
            freeBytes: totalSize * 99,   // Estimate 99% free
            usedBytes: totalSize,
            timestamp: Date.now()
        };
    }

    /**
     * Calculate total size of directory recursively
     */
    private async calculateDirectorySize(dirPath: string): Promise<number> {
        let totalSize = 0;

        try {
            for await (const entry of Deno.readDir(dirPath)) {
                const fullPath = `${dirPath}/${entry.name}`;
                
                if (entry.isFile) {
                    const stat = await Deno.stat(fullPath);
                    totalSize += stat.size;
                } else if (entry.isDirectory) {
                    totalSize += await this.calculateDirectorySize(fullPath);
                }
            }
        } catch (error) {
            // Directory doesn't exist or permission denied
            console.error(`Directory access failed for ${dirPath}: ${error.message}`);
        }

        return totalSize;
    }

    // Helper methods
    private async getFileSize(filePath: string): Promise<number> {
        try {
            const stat = await Deno.stat(filePath);
            return stat.size;
        } catch (error) {
            return 0;
        }
    }

    private async fileExists(filePath: string): Promise<boolean> {
        try {
            await Deno.stat(filePath);
            return true;
        } catch (error) {
            return false;
        }
    }

    private async calculateSHA256(data: Uint8Array): Promise<string> {
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    }

    private async calculateFileChecksum(filePath: string): Promise<string> {
        try {
            const data = await Deno.readFile(filePath);
            return await this.calculateSHA256(data);
        } catch (error) {
            return '';
        }
    }

    /**
     * Generate comprehensive verification report
     */
    async generateVerificationReport(): Promise<{
        totalOperations: number;
        verifiedOperations: number;
        verificationRate: number;
        diskAccuracy: number;
        externalVerificationCommands: string[];
    }> {
        const operations = Array.from(this.operationRecords.values());
        const verifiedOps = operations.filter(op => op.verified);
        
        // Get latest disk verification metrics using available queryEvents method
        const diskEvents = await this.storage.queryEvents('disk_verifier', [{
            kinds: [10808],
            limit: 1
        }]);
        
        const latestDiskAccuracy = diskEvents.length > 0 ? 
            JSON.parse(diskEvents[0].content).accuracy : 0;

        return {
            totalOperations: operations.length,
            verifiedOperations: verifiedOps.length,
            verificationRate: operations.length > 0 ? (verifiedOps.length / operations.length) * 100 : 100,
            diskAccuracy: latestDiskAccuracy,
            externalVerificationCommands: this.generateExternalCommands()
        };
    }

    /**
     * Generate external verification commands
     */
    private generateExternalCommands(): string[] {
        const commands = [
            '# Verify disk space usage:',
            `fsutil volume diskfree ${this.baseTestPath.charAt(0)}:`,
            '',
            '# PowerShell disk verification:',
            `Get-WmiObject -Class Win32_LogicalDisk | Where-Object {$_.DeviceID -eq '${this.baseTestPath.charAt(0)}:'} | Select-Object Size,FreeSpace`,
            '',
            '# Verify test files exist:',
            `dir "${this.baseTestPath}" /s`,
            '',
            '# Verify file checksums:'
        ];

        // Add checksum verification for each recorded file
        this.operationRecords.forEach((record, filePath) => {
            if (record.operation !== 'delete' && record.checksum) {
                commands.push(`certutil -hashfile "${filePath}" SHA256`);
                commands.push(`# Expected: ${record.checksum}`);
            }
        });

        return commands;
    }
}

// Factory function for Primary Rule compliance
export function createEnhancedDiskVerification(baseTestPath: string): EnhancedDiskVerification {
    return new EnhancedDiskVerification(baseTestPath);
}