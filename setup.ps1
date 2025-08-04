# EphemeraRelay Setup Script
Write-Host "`n🚀 Setting up EphemeraRelay...`n" -ForegroundColor Cyan

# Function to check if a command exists
function Test-Command($cmdname) {
    return [bool](Get-Command -Name $cmdname -ErrorAction SilentlyContinue)
}

# Function to create directory if it doesn't exist
function Ensure-Directory($path) {
    if (-not (Test-Path $path)) {
        New-Item -ItemType Directory -Force -Path $path | Out-Null
        Write-Host "✓ Created directory: $path" -ForegroundColor Green
    }
}

# Check and install Deno
Write-Host "📦 Checking Deno installation..." -ForegroundColor Yellow
if (-not (Test-Command "deno")) {
    Write-Host "Installing Deno..." -ForegroundColor Yellow
    try {
        # Download and run Deno installer
        Invoke-RestMethod https://deno.land/install.ps1 | Invoke-Expression
        
        # Add Deno to PATH for current session
        $env:Path += ";$env:USERPROFILE\.deno\bin"
        
        # Add Deno to PATH permanently
        $userPath = [Environment]::GetEnvironmentVariable("Path", "User")
        if (-not $userPath.Contains("$env:USERPROFILE\.deno\bin")) {
            [Environment]::SetEnvironmentVariable(
                "Path",
                "$userPath;$env:USERPROFILE\.deno\bin",
                "User"
            )
        }
        
        Write-Host "✓ Deno installed successfully" -ForegroundColor Green
    } catch {
        Write-Host "❌ Failed to install Deno: $_" -ForegroundColor Red
        exit 1
    }
} else {
    Write-Host "✓ Deno already installed" -ForegroundColor Green
}

# Create project structure
Write-Host "`n📁 Setting up project structure..." -ForegroundColor Yellow

# Create directories
$directories = @(
    "public",
    "public\css",
    "public\js",
    "public\icons",
    "public\screenshots"
)

foreach ($dir in $directories) {
    Ensure-Directory $dir
}

# Initialize deno.json if it doesn't exist
if (-not (Test-Path "deno.json")) {
    $denoConfig = @{
        tasks = @{
            dev = "deno run --allow-net --allow-read --watch server.ts"
            start = "deno run --allow-net --allow-read server.ts"
            test = "deno test --allow-net"
        }
        imports = @{
            "nostr-tools" = "npm:nostr-tools@^1.7.4"
        }
        fmt = @{
            options = @{
                indentWidth = 2
                lineWidth = 120
                singleQuote = $true
            }
        }
    }
    
    $denoConfig | ConvertTo-Json -Depth 10 | Set-Content "deno.json"
    Write-Host "✓ Created deno.json configuration" -ForegroundColor Green
}

# Check if all required files exist
$requiredFiles = @(
    "server.ts",
    "types.ts",
    "consistent-hash.ts",
    "privacy-storage.ts",
    "node-discovery.ts",
    "distributed-coordinator.ts",
    "distributed-handler.ts",
    "config.ts",
    "public/index.html",
    "public/css/styles.css",
    "public/js/app.js",
    "public/manifest.json",
    "public/sw.js"
)

$missingFiles = $requiredFiles | Where-Object { -not (Test-Path $_) }
if ($missingFiles) {
    Write-Host "`n⚠️ Missing required files:" -ForegroundColor Yellow
    $missingFiles | ForEach-Object {
        Write-Host "   - $_" -ForegroundColor Yellow
    }
    Write-Host "`nPlease ensure all required files are present before running the server."
}

# Cache dependencies
Write-Host "`n📥 Caching dependencies..." -ForegroundColor Yellow
try {
    deno cache server.ts
    Write-Host "✓ Dependencies cached successfully" -ForegroundColor Green
} catch {
    Write-Host "❌ Failed to cache dependencies: $_" -ForegroundColor Red
}

Write-Host "`n✨ Setup completed!`n" -ForegroundColor Cyan
Write-Host "To start the server in development mode:"
Write-Host "   deno task dev" -ForegroundColor Yellow
Write-Host "`nTo start the server in production mode:"
Write-Host "   deno task start" -ForegroundColor Yellow
Write-Host "`nTo run tests:"
Write-Host "   deno task test" -ForegroundColor Yellow 