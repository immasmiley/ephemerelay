@echo off
echo Starting EphemeraRelay server on port 5001...
set PORT=5001
C:\Users\Chinna\.deno\bin\deno.exe run --allow-net --allow-read --allow-env server.ts 