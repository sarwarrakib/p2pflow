#!/usr/bin/env node
import { performance } from 'node:perf_hooks';

const base = (process.env.P2PFLOW_SMOKE_URL || process.argv[2] || '').replace(/\/$/, '');
const requests = Math.max(1, Number(process.env.P2PFLOW_SMOKE_REQUESTS || process.argv[3] || 100));
const concurrency = Math.max(1, Math.min(100, Number(process.env.P2PFLOW_SMOKE_CONCURRENCY || process.argv[4] || 10)));
const paths = String(process.env.P2PFLOW_SMOKE_PATHS || '/healthz,/ready').split(',').map(x => x.trim()).filter(Boolean);
if (!base || !/^https?:\/\//i.test(base)) {
  console.error('Usage: node scripts/http-smoke-load.mjs https://p2pflow.example [requests=100] [concurrency=10]');
  process.exit(2);
}

const samples = [];
let next = 0;
let errors = 0;
let badStatus = 0;
async function worker() {
  while (true) {
    const i = next++;
    if (i >= requests) return;
    const path = paths[i % paths.length];
    const started = performance.now();
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 10000);
      const response = await fetch(base + path, { signal: controller.signal, redirect: 'manual', headers: { 'user-agent': 'p2pflow-prelaunch-smoke/2.0.8' } });
      clearTimeout(timer);
      const ms = performance.now() - started;
      samples.push(ms);
      if (!response.ok) badStatus++;
      await response.arrayBuffer().catch(() => {});
    } catch (err) {
      errors++;
      samples.push(performance.now() - started);
    }
  }
}
await Promise.all(Array.from({ length: Math.min(concurrency, requests) }, () => worker()));
samples.sort((a,b) => a-b);
const pct = p => samples.length ? samples[Math.min(samples.length - 1, Math.floor((samples.length - 1) * p))] : 0;
const avg = samples.length ? samples.reduce((a,b) => a+b, 0) / samples.length : 0;
console.log(JSON.stringify({ base, paths, requests, concurrency, errors, badStatus, avgMs: +avg.toFixed(1), p50Ms: +pct(.50).toFixed(1), p95Ms: +pct(.95).toFixed(1), p99Ms: +pct(.99).toFixed(1) }, null, 2));
if (errors || badStatus) process.exit(1);
