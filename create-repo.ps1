# Simple GitHub repository creation helper

Write-Host "=== GitHub Repository Creation Helper ===" -ForegroundColor Green
Write-Host ""

Write-Host "To create the repository:" -ForegroundColor Yellow
Write-Host "1. Go to: https://github.com/new" -ForegroundColor White
Write-Host "2. Repository name: ephemerelay" -ForegroundColor White
Write-Host "3. Description: Distributed Nostr relay with privacy-preserving storage" -ForegroundColor White
Write-Host "4. Make it Public" -ForegroundColor White
Write-Host "5. Don't initialize with README" -ForegroundColor White
Write-Host "6. Click Create repository" -ForegroundColor White
Write-Host ""

# Update git remote
Write-Host "Setting up git remote..." -ForegroundColor Yellow
git remote set-url origin https://github.com/immasmiley/ephemerelay.git

Write-Host ""
Write-Host "After creating the repository, run:" -ForegroundColor Green
Write-Host "git push -u origin develop" -ForegroundColor White
Write-Host ""

Write-Host "=== Ready to push! ===" -ForegroundColor Green 