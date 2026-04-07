#!/usr/bin/env node
import { spawn } from 'node:child_process';
import process from 'node:process';
import { buildAscSummary, writeJsonOutput } from './openclaw-exporters-lib.mjs';
function printHelpAndExit(exitCode, reason = null) {
    if (reason) {
        process.stderr.write(`${reason}\n\n`);
    }
    process.stdout.write(`
Export ASC Summary

Builds an OpenClaw-compatible store/release summary JSON from the asc CLI.

Usage:
  node scripts/export-asc-summary.mjs [options]

Options:
  --app <id>             App Store Connect app ID (defaults to ASC_APP_ID)
  --out <file>           Write JSON to file instead of stdout
  --country <code>       Ratings country override (default: all countries)
  --reviews-limit <n>    Review summarizations limit (default: 20)
  --feedback-limit <n>   TestFlight feedback limit (default: 20)
  --max-signals <n>      Maximum signals to emit (default: 4)
  --help, -h             Show help
`);
    process.exit(exitCode);
}
function parseArgs(argv) {
    const args = {
        app: String(process.env.ASC_APP_ID || '').trim(),
        out: '',
        country: '',
        reviewsLimit: 20,
        feedbackLimit: 20,
        maxSignals: 4,
    };
    for (let index = 0; index < argv.length; index += 1) {
        const token = argv[index];
        const next = argv[index + 1];
        if (token === '--') {
            continue;
        }
        else if (token === '--app') {
            args.app = String(next || '').trim();
            index += 1;
        }
        else if (token === '--out') {
            args.out = String(next || '').trim();
            index += 1;
        }
        else if (token === '--country') {
            args.country = String(next || '').trim();
            index += 1;
        }
        else if (token === '--reviews-limit') {
            const parsed = Number.parseInt(String(next || ''), 10);
            if (!Number.isFinite(parsed) || parsed <= 0) {
                printHelpAndExit(1, `Invalid value for --reviews-limit: ${String(next || '')}`);
            }
            args.reviewsLimit = parsed;
            index += 1;
        }
        else if (token === '--feedback-limit') {
            const parsed = Number.parseInt(String(next || ''), 10);
            if (!Number.isFinite(parsed) || parsed <= 0) {
                printHelpAndExit(1, `Invalid value for --feedback-limit: ${String(next || '')}`);
            }
            args.feedbackLimit = parsed;
            index += 1;
        }
        else if (token === '--max-signals') {
            const parsed = Number.parseInt(String(next || ''), 10);
            if (!Number.isFinite(parsed) || parsed <= 0) {
                printHelpAndExit(1, `Invalid value for --max-signals: ${String(next || '')}`);
            }
            args.maxSignals = parsed;
            index += 1;
        }
        else if (token === '--help' || token === '-h') {
            printHelpAndExit(0);
        }
        else {
            printHelpAndExit(1, `Unknown argument: ${token}`);
        }
    }
    if (!args.app) {
        printHelpAndExit(1, 'Missing app ID. Pass --app <id> or set ASC_APP_ID.');
    }
    return args;
}
function runJsonCommand(command, commandArgs) {
    return new Promise((resolve, reject) => {
        const child = spawn(command, commandArgs, {
            stdio: ['ignore', 'pipe', 'pipe'],
            env: process.env,
        });
        let stdout = '';
        let stderr = '';
        child.stdout.on('data', (chunk) => {
            stdout += String(chunk);
        });
        child.stderr.on('data', (chunk) => {
            stderr += String(chunk);
        });
        child.on('error', reject);
        child.on('close', (code) => {
            if (code !== 0) {
                reject(Object.assign(new Error(stderr.trim() || `${command} exited with code ${code}`), { exitCode: code }));
                return;
            }
            try {
                resolve(JSON.parse(stdout));
            }
            catch {
                reject(new Error(`${command} returned non-JSON output`));
            }
        });
    });
}
async function runOptionalAscQuery(label, args) {
    try {
        return await runJsonCommand('asc', args);
    }
    catch (error) {
        const exitCode = error && typeof error === 'object' && 'exitCode' in error ? error.exitCode : null;
        if (exitCode === 2 || exitCode === 3) {
            return null;
        }
        throw new Error(`${label} failed: ${error instanceof Error ? error.message : String(error)}`);
    }
}
async function main() {
    const args = parseArgs(process.argv.slice(2));
    const statusPayload = await runJsonCommand('asc', [
        'status',
        '--app',
        args.app,
        '--include',
        'builds,testflight,submission,review,appstore',
    ]);
    const ratingsArgs = ['reviews', 'ratings', '--app', args.app];
    if (args.country) {
        ratingsArgs.push('--country', args.country);
    }
    else {
        ratingsArgs.push('--all');
    }
    const ratingsPayload = await runOptionalAscQuery('ASC ratings query', ratingsArgs);
    const reviewSummariesPayload = await runOptionalAscQuery('ASC review summarizations query', [
        'reviews',
        'summarizations',
        '--app',
        args.app,
        '--platform',
        'IOS',
        '--limit',
        String(args.reviewsLimit),
        '--fields',
        'text,createdDate,locale',
    ]);
    const feedbackPayload = await runOptionalAscQuery('ASC beta feedback query', [
        'feedback',
        '--app',
        args.app,
        '--limit',
        String(args.feedbackLimit),
        '--sort',
        '-createdDate',
    ]);
    const summary = buildAscSummary({
        appId: args.app,
        statusPayload,
        ratingsPayload,
        reviewSummariesPayload,
        feedbackPayload,
        maxSignals: args.maxSignals,
    });
    await writeJsonOutput(args.out, summary);
}
main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
});
