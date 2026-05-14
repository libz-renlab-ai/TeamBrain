# BPP transcript purge — Windows Task Scheduler installer.
# Spec: docs/superpowers/specs/2026-05-13-best-practice-push-design.md §6.1
#
# Usage (run from an elevated PowerShell):
#   .\bpp-purge-windows-task.ps1 -Install -BppOutputDir 'D:\teamagent\bpp-collector' -BppRetainDays 30
#   .\bpp-purge-windows-task.ps1 -Uninstall
#
# Optional params:
#   -DailyAt       Time of day (default '03:00')
#   -NodeExe       Path to node.exe   (default: where.exe node)
#   -BinJs         Path to compiled bin-purge-cron.js (default: relative)
#   -TaskName      Scheduled-task name (default 'TeamAgent-BPP-Purge')

[CmdletBinding(DefaultParameterSetName='Install')]
param(
    [Parameter(ParameterSetName='Install', Mandatory=$true)]
    [switch]$Install,

    [Parameter(ParameterSetName='Uninstall', Mandatory=$true)]
    [switch]$Uninstall,

    [Parameter(ParameterSetName='Install', Mandatory=$true)]
    [string]$BppOutputDir,

    [Parameter(ParameterSetName='Install')]
    [int]$BppRetainDays = 30,

    [Parameter(ParameterSetName='Install')]
    [string]$DailyAt = '03:00',

    [Parameter(ParameterSetName='Install')]
    [string]$NodeExe,

    [Parameter(ParameterSetName='Install')]
    [string]$BinJs,

    [Parameter()]
    [string]$TaskName = 'TeamAgent-BPP-Purge'
)

$ErrorActionPreference = 'Stop'

if ($Uninstall) {
    if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
        Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
        Write-Host "Removed scheduled task '$TaskName'."
    } else {
        Write-Host "Scheduled task '$TaskName' not found — nothing to do."
    }
    return
}

# --- Install branch ---

if (-not $NodeExe) {
    $cmd = Get-Command node -ErrorAction SilentlyContinue
    if (-not $cmd) {
        throw "node.exe not found on PATH. Pass -NodeExe 'C:\path\to\node.exe'."
    }
    $NodeExe = $cmd.Source
}

if (-not $BinJs) {
    # Default: assume repo layout, script lives in scripts/bpp-cron/.
    $repoRoot = Resolve-Path (Join-Path $PSScriptRoot '..\..')
    $BinJs = Join-Path $repoRoot 'packages\digital-twin\dist\bin-purge-cron.js'
}

if (-not (Test-Path $BinJs)) {
    Write-Warning "bin-purge-cron.js not found at '$BinJs'. Run `pnpm --filter @teamagent/digital-twin build` first."
}

$action = New-ScheduledTaskAction `
    -Execute $NodeExe `
    -Argument "`"$BinJs`""

$trigger = New-ScheduledTaskTrigger -Daily -At $DailyAt

$envBlock = @{
    BPP_OUTPUT_DIR  = $BppOutputDir
    BPP_RETAIN_DAYS = "$BppRetainDays"
}
# Task Scheduler doesn't expose Environment= directly; wrap node call in a
# cmd /c shim so env vars are set per-invocation.
$cmdLine = "/c set BPP_OUTPUT_DIR=$BppOutputDir && set BPP_RETAIN_DAYS=$BppRetainDays && `"$NodeExe`" `"$BinJs`""
$action = New-ScheduledTaskAction -Execute 'cmd.exe' -Argument $cmdLine

$settings = New-ScheduledTaskSettingsSet `
    -StartWhenAvailable `
    -DontStopOnIdleEnd `
    -RunOnlyIfNetworkAvailable:$false `
    -ExecutionTimeLimit (New-TimeSpan -Minutes 10)

$principal = New-ScheduledTaskPrincipal `
    -UserId 'SYSTEM' `
    -LogonType ServiceAccount `
    -RunLevel Highest

# Replace existing task if present.
if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
}

Register-ScheduledTask `
    -TaskName $TaskName `
    -Description "TeamAgent BPP transcript purge (30-day retention)" `
    -Action $action `
    -Trigger $trigger `
    -Settings $settings `
    -Principal $principal | Out-Null

Write-Host "Installed scheduled task '$TaskName' — fires daily at $DailyAt."
Write-Host "Verify with: Get-ScheduledTask -TaskName '$TaskName'"
Write-Host "Run once now: Start-ScheduledTask -TaskName '$TaskName'"
