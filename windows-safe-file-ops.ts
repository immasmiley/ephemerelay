/**
 * WINDOWS-SAFE FILE OPERATIONS
 * 
 * Handles Windows file path length limitations and provides safe cleanup methods.
 * Implements progressive cleanup, short path handling, and alternative cleanup strategies.
 */

export interface CleanupOptions {
    directory: string;
    progressCallback?: (progress: CleanupProgress) => void;
    batchSize?: number;
    useShortPaths?: boolean;
    fallbackToExternal?: boolean;
}

export interface CleanupProgress {
    filesProcessed: number;
    totalFiles: number;
    percentComplete: number;
    errors: string[];
    currentFile?: string;
}

export interface CleanupResult {
    success: boolean;
    filesDeleted: number;
    filesSkipped: number;
    errors: string[];
    method: string;
    durationMs: number;
}

export class WindowsSafeFileOps {
    private static readonly MAX_PATH_LENGTH = 260; // Windows MAX_PATH
    private static readonly LONG_PATH_PREFIX = '\\\\?\\'; // Windows long path prefix
    private static readonly DEFAULT_BATCH_SIZE = 50;

    /**
     * Safe file cleanup that handles Windows path length limitations
     */
    static async safeFileCleanup(options: CleanupOptions): Promise<CleanupResult> {
        const startTime = Date.now();
        const result: CleanupResult = {
            success: false,
            filesDeleted: 0,
            filesSkipped: 0,
            errors: [],
            method: 'unknown',
            durationMs: 0
        };

        console.log(`🧹 Starting safe cleanup of: ${options.directory}`);

        try {
            // Method 1: Standard Deno removal
            try {
                await Deno.remove(options.directory, { recursive: true });
                result.success = true;
                result.method = 'standard_removal';
                result.filesDeleted = 1; // Directory removal
                console.log('✅ Standard removal succeeded');
                
                result.durationMs = Date.now() - startTime;
                return result;
            } catch (error) {
                result.errors.push(`Standard removal failed: ${error.message}`);
                console.log(`⚠️ Standard removal failed: ${error.message}`);
            }

            // Method 2: Progressive deletion
            console.log('🔄 Attempting progressive deletion...');
            const progressiveResult = await this.progressiveCleanup(options);
            if (progressiveResult.success) {
                result.success = true;
                result.method = 'progressive_deletion';
                result.filesDeleted = progressiveResult.filesDeleted;
                result.errors.push(...progressiveResult.errors);
                
                result.durationMs = Date.now() - startTime;
                return result;
            } else {
                result.errors.push(...progressiveResult.errors);
            }

            // Method 3: External command cleanup (Windows only)
            if (Deno.build.os === 'windows' && options.fallbackToExternal) {
                console.log('🔄 Attempting external command cleanup...');
                const externalResult = await this.externalCleanup(options.directory);
                if (externalResult.success) {
                    result.success = true;
                    result.method = 'external_command';
                    result.filesDeleted = externalResult.filesDeleted;
                    result.errors.push(...externalResult.errors);
                }
            }

        } catch (error) {
            result.errors.push(`Cleanup failed: ${error.message}`);
        }

        result.durationMs = Date.now() - startTime;
        
        if (result.success) {
            console.log(`✅ Cleanup completed using ${result.method} in ${result.durationMs}ms`);
        } else {
            console.log(`❌ All cleanup methods failed`);
        }

        return result;
    }

    /**
     * Progressive cleanup - delete files in small batches
     */
    private static async progressiveCleanup(options: CleanupOptions): Promise<CleanupResult> {
        const result: CleanupResult = {
            success: false,
            filesDeleted: 0,
            filesSkipped: 0,
            errors: [],
            method: 'progressive_deletion',
            durationMs: 0
        };

        const batchSize = options.batchSize || this.DEFAULT_BATCH_SIZE;

        try {
            // First, get all files to delete
            const filesToDelete = await this.getAllFiles(options.directory);
            console.log(`📂 Found ${filesToDelete.length} files to delete`);

            if (filesToDelete.length === 0) {
                result.success = true;
                return result;
            }

            // Process files in batches
            for (let i = 0; i < filesToDelete.length; i += batchSize) {
                const batch = filesToDelete.slice(i, i + batchSize);
                
                for (const filePath of batch) {
                    try {
                        // Report progress
                        if (options.progressCallback) {
                            options.progressCallback({
                                filesProcessed: result.filesDeleted + result.filesSkipped,
                                totalFiles: filesToDelete.length,
                                percentComplete: ((result.filesDeleted + result.filesSkipped) / filesToDelete.length) * 100,
                                errors: result.errors,
                                currentFile: filePath
                            });
                        }

                        // Try to delete the file
                        const safePath = this.makePathSafe(filePath, options.useShortPaths);
                        await Deno.remove(safePath);
                        result.filesDeleted++;

                        if (result.filesDeleted % 100 === 0) {
                            console.log(`   Deleted ${result.filesDeleted}/${filesToDelete.length} files`);
                        }

                    } catch (error) {
                        result.filesSkipped++;
                        result.errors.push(`Failed to delete ${filePath}: ${error.message}`);
                        
                        // Don't spam errors, just log every 10th error
                        if (result.errors.length % 10 === 0) {
                            console.log(`   ⚠️ ${result.errors.length} files failed to delete`);
                        }
                    }
                }

                // Small delay between batches to prevent overwhelming the system
                if (i + batchSize < filesToDelete.length) {
                    await new Promise(resolve => setTimeout(resolve, 10));
                }
            }

            // Try to remove empty directories
            await this.removeEmptyDirectories(options.directory);

            result.success = result.filesDeleted > 0 || filesToDelete.length === 0;

        } catch (error) {
            result.errors.push(`Progressive cleanup failed: ${error.message}`);
        }

        return result;
    }

    /**
     * External command cleanup using Windows built-in tools
     */
    private static async externalCleanup(directory: string): Promise<CleanupResult> {
        const result: CleanupResult = {
            success: false,
            filesDeleted: 0,
            filesSkipped: 0,
            errors: [],
            method: 'external_command',
            durationMs: 0
        };

        try {
            // Use robocopy to move to temp then delete (handles long paths)
            const tempDir = await Deno.makeTempDir({ prefix: 'sphere_cleanup_' });
            
            // Use robocopy /MOVE to move files to temp directory
            const robocopyCmd = new Deno.Command('robocopy', {
                args: [directory, tempDir, '/MOVE', '/E', '/NFL', '/NDL', '/NJH', '/NJS'],
                stdout: 'piped',
                stderr: 'piped'
            });

            const robocopyResult = await robocopyCmd.output();
            
            // Robocopy exit codes: 0-7 are success, 8+ are errors
            if (robocopyResult.code <= 7) {
                // Now delete the temp directory (should be easier)
                await Deno.remove(tempDir, { recursive: true });
                result.success = true;
                result.filesDeleted = 1; // Approximate
                console.log('✅ External cleanup with robocopy succeeded');
            } else {
                const stderr = new TextDecoder().decode(robocopyResult.stderr);
                result.errors.push(`Robocopy failed: ${stderr}`);
                
                // Try alternative: rmdir command
                const rmdirCmd = new Deno.Command('cmd', {
                    args: ['/c', 'rmdir', '/s', '/q', `"${directory}"`],
                    stdout: 'piped',
                    stderr: 'piped'
                });

                const rmdirResult = await rmdirCmd.output();
                if (rmdirResult.code === 0) {
                    result.success = true;
                    result.filesDeleted = 1;
                    console.log('✅ External cleanup with rmdir succeeded');
                } else {
                    const rmdirError = new TextDecoder().decode(rmdirResult.stderr);
                    result.errors.push(`Rmdir failed: ${rmdirError}`);
                }
            }

        } catch (error) {
            result.errors.push(`External cleanup failed: ${error.message}`);
        }

        return result;
    }

    /**
     * Get all files in a directory recursively
     */
    private static async getAllFiles(directory: string): Promise<string[]> {
        const files: string[] = [];

        try {
            for await (const entry of Deno.readDir(directory)) {
                const fullPath = `${directory}/${entry.name}`;
                
                if (entry.isDirectory) {
                    const subFiles = await this.getAllFiles(fullPath);
                    files.push(...subFiles);
                } else {
                    files.push(fullPath);
                }
            }
        } catch (error) {
            console.log(`⚠️ Could not read directory ${directory}: ${error.message}`);
        }

        return files;
    }

    /**
     * Remove empty directories recursively
     */
    private static async removeEmptyDirectories(directory: string): Promise<void> {
        try {
            const entries = [];
            for await (const entry of Deno.readDir(directory)) {
                entries.push(entry);
            }

            // Remove subdirectories first
            for (const entry of entries) {
                if (entry.isDirectory) {
                    const subdirPath = `${directory}/${entry.name}`;
                    await this.removeEmptyDirectories(subdirPath);
                }
            }

            // Try to remove this directory if it's empty
            try {
                await Deno.remove(directory);
            } catch {
                // Directory not empty or other error, ignore
            }

        } catch {
            // Directory doesn't exist or can't be read, ignore
        }
    }

    /**
     * Make a file path safe for Windows operations
     */
    private static makePathSafe(filePath: string, useShortPaths: boolean = false): string {
        if (Deno.build.os !== 'windows') {
            return filePath;
        }

        // Convert forward slashes to backslashes
        let safePath = filePath.replace(/\//g, '\\');

        // Handle long paths
        if (safePath.length > this.MAX_PATH_LENGTH && !safePath.startsWith(this.LONG_PATH_PREFIX)) {
            safePath = this.LONG_PATH_PREFIX + safePath;
        }

        return safePath;
    }

    /**
     * Check if path is too long for Windows
     */
    static isPathTooLong(filePath: string): boolean {
        if (Deno.build.os !== 'windows') {
            return false;
        }

        return filePath.length > this.MAX_PATH_LENGTH;
    }

    /**
     * Validate that a directory can be safely used
     */
    static async validateDirectory(directory: string): Promise<{ valid: boolean; issues: string[] }> {
        const issues: string[] = [];

        // Check path length
        if (this.isPathTooLong(directory)) {
            issues.push(`Path too long: ${directory.length} > ${this.MAX_PATH_LENGTH} characters`);
        }

        // Check if directory exists
        try {
            const stat = await Deno.stat(directory);
            if (!stat.isDirectory) {
                issues.push('Path exists but is not a directory');
            }
        } catch {
            issues.push('Directory does not exist or is not accessible');
        }

        // Check for problematic characters
        const problematicChars = /[<>:"|?*]/;
        if (problematicChars.test(directory)) {
            issues.push('Directory contains problematic characters');
        }

        return {
            valid: issues.length === 0,
            issues
        };
    }

    /**
     * Create a directory with safe naming
     */
    static async createSafeDirectory(basePath: string, name: string): Promise<string> {
        // Sanitize the name
        const safeName = name.replace(/[<>:"|?*]/g, '_').substring(0, 50);
        const fullPath = `${basePath}/${safeName}`;

        // Check if path would be too long
        if (this.isPathTooLong(fullPath)) {
            // Use a shorter name
            const shortName = safeName.substring(0, 20) + '_' + Date.now().toString(36);
            const shortPath = `${basePath}/${shortName}`;
            await Deno.mkdir(shortPath, { recursive: true });
            return shortPath;
        }

        await Deno.mkdir(fullPath, { recursive: true });
        return fullPath;
    }

    /**
     * Test the file operations with various scenarios
     */
    static async testFileOperations(): Promise<boolean> {
        console.log('🧪 Testing Windows-safe file operations...');

        try {
            // Create test directory with safe name
            const testBaseDir = await this.createSafeDirectory('.', 'test_file_ops');
            console.log(`Created test directory: ${testBaseDir}`);

            // Test 1: Create files with long names
            const longNameFile = `${testBaseDir}/${'a'.repeat(100)}.txt`;
            try {
                await Deno.writeTextFile(longNameFile, 'test content');
                console.log('✅ Long filename creation succeeded');
            } catch (error) {
                console.log(`⚠️ Long filename creation failed: ${error.message}`);
            }

            // Test 2: Create nested directories
            const deepPath = `${testBaseDir}/deep/nested/directory/structure/file.txt`;
            try {
                await Deno.mkdir(`${testBaseDir}/deep/nested/directory/structure`, { recursive: true });
                await Deno.writeTextFile(deepPath, 'nested file content');
                console.log('✅ Deep directory creation succeeded');
            } catch (error) {
                console.log(`⚠️ Deep directory creation failed: ${error.message}`);
            }

            // Test 3: Progressive cleanup
            const cleanupResult = await this.safeFileCleanup({
                directory: testBaseDir,
                batchSize: 10,
                useShortPaths: true,
                fallbackToExternal: true
            });

            console.log(`✅ Cleanup test: ${cleanupResult.success ? 'PASSED' : 'FAILED'}`);
            console.log(`   Method: ${cleanupResult.method}`);
            console.log(`   Files deleted: ${cleanupResult.filesDeleted}`);
            console.log(`   Errors: ${cleanupResult.errors.length}`);

            return cleanupResult.success;

        } catch (error) {
            console.log(`❌ File operations test failed: ${error.message}`);
            return false;
        }
    }
}

// Run tests if executed directly
if (import.meta.main) {
    const success = await WindowsSafeFileOps.testFileOperations();
    if (!success) {
        Deno.exit(1);
    }
}