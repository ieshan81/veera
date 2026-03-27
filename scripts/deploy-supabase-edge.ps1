# Deploy Edge Functions to the Supabase project in supabase/config.toml (project_id).
# Requires auth: either run `npm run supabase:login` once, OR set SUPABASE_ACCESS_TOKEN
# (Dashboard -> Account -> Access Tokens -> Generate new token).
#
# Usage (PowerShell, from repo root):
#   $env:SUPABASE_ACCESS_TOKEN = "sbp_..."   # optional if already logged in via CLI
#   $env:QR_PUBLIC_BASE_URL = "https://your-site.com/p"
#   .\scripts\deploy-supabase-edge.ps1
#
# If QR_PUBLIC_BASE_URL is omitted, only functions are deployed (existing secret kept).

$ErrorActionPreference = "Stop"
Set-Location (Split-Path $PSScriptRoot -Parent)

if (-not $env:SUPABASE_ACCESS_TOKEN) {
  $login = npx supabase projects list 2>&1
  if ($LASTEXITCODE -ne 0) {
    Write-Host @"
No Supabase CLI session found.

Option A — Browser login (easiest):
  npm run supabase:login

Option B — Access token (CI / no browser):
  Create a token: https://supabase.com/dashboard/account/tokens
  `$env:SUPABASE_ACCESS_TOKEN = 'your_token_here'

Then re-run this script.
"@
    exit 1
  }
}

if ($env:QR_PUBLIC_BASE_URL) {
  Write-Host "Setting secret QR_PUBLIC_BASE_URL..."
  npx supabase secrets set "QR_PUBLIC_BASE_URL=$($env:QR_PUBLIC_BASE_URL)"
}

Write-Host "Deploying plant-qr-upsert..."
npx supabase functions deploy plant-qr-upsert
Write-Host "Deploying admin-signup..."
npx supabase functions deploy admin-signup
Write-Host "Done. Check: https://supabase.com/dashboard/project/zzjmfpwfsqykgxynfbgy/functions"
