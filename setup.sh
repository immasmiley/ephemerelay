#!/bin/bash

# ANSI color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Print with color
print_color() {
    local color=$1
    local message=$2
    echo -e "${color}${message}${NC}"
}

# Function to check if a command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Function to create directory if it doesn't exist
ensure_directory() {
    if [ ! -d "$1" ]; then
        mkdir -p "$1"
        print_color "$GREEN" "✓ Created directory: $1"
    fi
}

print_color "$CYAN" "\n🚀 Setting up EphemeraRelay...\n"

# Check and install Deno
print_color "$YELLOW" "📦 Checking Deno installation..."
if ! command_exists deno; then
    print_color "$YELLOW" "Installing Deno..."
    curl -fsSL https://deno.land/x/install/install.sh | sh

    # Add Deno to PATH for current session
    export DENO_INSTALL="$HOME/.deno"
    export PATH="$DENO_INSTALL/bin:$PATH"

    # Add Deno to PATH permanently
    if [ -f "$HOME/.bashrc" ]; then
        echo 'export DENO_INSTALL="$HOME/.deno"' >> "$HOME/.bashrc"
        echo 'export PATH="$DENO_INSTALL/bin:$PATH"' >> "$HOME/.bashrc"
    fi
    if [ -f "$HOME/.zshrc" ]; then
        echo 'export DENO_INSTALL="$HOME/.deno"' >> "$HOME/.zshrc"
        echo 'export PATH="$DENO_INSTALL/bin:$PATH"' >> "$HOME/.zshrc"
    fi

    print_color "$GREEN" "✓ Deno installed successfully"
else
    print_color "$GREEN" "✓ Deno already installed"
fi

# Create project structure
print_color "$YELLOW" "\n📁 Setting up project structure..."

# Create directories
directories=(
    "public"
    "public/css"
    "public/js"
    "public/icons"
    "public/screenshots"
)

for dir in "${directories[@]}"; do
    ensure_directory "$dir"
done

# Initialize deno.json if it doesn't exist
if [ ! -f "deno.json" ]; then
    cat > deno.json << EOF
{
  "tasks": {
    "dev": "deno run --allow-net --allow-read --watch server.ts",
    "start": "deno run --allow-net --allow-read server.ts",
    "test": "deno test --allow-net"
  },
  "imports": {
    "nostr-tools": "npm:nostr-tools@^1.7.4"
  },
  "fmt": {
    "options": {
      "indentWidth": 2,
      "lineWidth": 120,
      "singleQuote": true
    }
  }
}
EOF
    print_color "$GREEN" "✓ Created deno.json configuration"
fi

# Check if all required files exist
required_files=(
    "server.ts"
    "types.ts"
    "consistent-hash.ts"
    "privacy-storage.ts"
    "node-discovery.ts"
    "distributed-coordinator.ts"
    "distributed-handler.ts"
    "config.ts"
    "public/index.html"
    "public/css/styles.css"
    "public/js/app.js"
    "public/manifest.json"
    "public/sw.js"
)

missing_files=()
for file in "${required_files[@]}"; do
    if [ ! -f "$file" ]; then
        missing_files+=("$file")
    fi
done

if [ ${#missing_files[@]} -ne 0 ]; then
    print_color "$YELLOW" "\n⚠️ Missing required files:"
    for file in "${missing_files[@]}"; do
        print_color "$YELLOW" "   - $file"
    done
    echo -e "\nPlease ensure all required files are present before running the server."
fi

# Cache dependencies
print_color "$YELLOW" "\n📥 Caching dependencies..."
if deno cache server.ts; then
    print_color "$GREEN" "✓ Dependencies cached successfully"
else
    print_color "$RED" "❌ Failed to cache dependencies"
fi

print_color "$CYAN" "\n✨ Setup completed!\n"
echo "To start the server in development mode:"
print_color "$YELLOW" "   deno task dev"
echo -e "\nTo start the server in production mode:"
print_color "$YELLOW" "   deno task start"
echo -e "\nTo run tests:"
print_color "$YELLOW" "   deno task test" 