#!/usr/bin/env node
// dsh-plugin-media-index — indexa y busca media local con ffprobe.
// Tools: status, scan, search.

import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { McpServer } from '@modelcontextprotocol/server';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { z } from 'zod';

const VERSION = '0.1.0';
const DSH_HOME = (() => {
  const v = process.env.DSH_HOME && process.env.DSH_HOME.trim();
  return v || path.join(process.env.USERPROFILE || process.env.HOME || os.homedir(), '.dsh');
})();
const CONFIG_FILE = path.join(DSH_HOME, 'media-index', 'config.json');
const CACHE_DIR = path.join(DSH_HOME, 'cache', 'media-index');
const MEDIA_EXT = /\.(mp4|mkv|webm|mov|avi|mp3|wav|flac|m4a|ogg|png|jpe?g|webp|gif)$/i;
const MAX_FILES = 100;
const MAX_DEPTH = 4;
const log = (m) => process.stderr.write(`[mediaindex] ${m}\n`);

function loadConfig() { try { if (existsSync(CONFIG_FILE)) return { allowedPaths: [], ffprobePath: '', ...(JSON.parse(readFileSync(CONFIG_FILE, 'utf8')) || {}) }; } catch { /* defaults */ } return { allowedPaths: [], ffprobePath: '' }; }
function allowedRoots() { const configured = loadConfig().allowedPaths; return (Array.isArray(configured) && configured.length ? configured : [process.env.USERPROFILE || process.env.HOME || os.homedir()]).map((item) => path.resolve(item)); }
function isAllowed(target) { const resolved = path.resolve(target); return resolved === CACHE_DIR || resolved.startsWith(CACHE_DIR + path.sep) || allowedRoots().some((root) => resolved === root || resolved.startsWith(root + path.sep)); }
function findFfprobe() {
  const configured = loadConfig().ffprobePath;
  if (configured && existsSync(configured)) return configured;
  for (const candidate of ['ffprobe', 'ffprobe.exe']) { const result = spawnSync(candidate, ['-version'], { encoding: 'utf8', timeout: 8000, windowsHide: true }); if (result.status === 0) return candidate; }
  return null;
}
function listMedia(rootInner) {
  const root = path.resolve(rootInner);
  if (!existsSync(root)) throw new Error(`la ruta no existe: ${root}`);
  const stat = statSync(root);
  if (!isAllowed(root)) throw new Error(`ruta no permitida (revisa allowedPaths): ${root}`);
  if (stat.isFile()) return [root];
  const files = [];
  const walk = (dir, depth) => {
    if (depth > MAX_DEPTH || files.length >= MAX_FILES) return;
    for (const entry of (() => { try { return readdirSync(dir, { withFileTypes: true }); } catch { return []; } })()) {
      if (files.length >= MAX_FILES) return;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full, depth + 1);
      else if (entry.isFile() && MEDIA_EXT.test(entry.name)) files.push(full);
    }
  };
  walk(root, 1);
  return files;
}
function probe(file, ffprobe) {
  const result = spawnSync(ffprobe, ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', file], { encoding: 'utf8', timeout: 15000, windowsHide: true });
  if (result.status !== 0) return { error: (result.stderr || '').trim().slice(0, 160) };
  try {
    const data = JSON.parse(result.stdout);
    const video = (data.streams || []).find((stream) => stream.codec_type === 'video');
    const audio = (data.streams || []).find((stream) => stream.codec_type === 'audio');
    return {
      duration: Number(data.format?.duration || video?.duration || audio?.duration || 0),
      size: Number(data.format?.size || 0),
      width: video?.width || null,
      height: video?.height || null,
      videoCodec: video?.codec_name || null,
      audioCodec: audio?.codec_name || null,
    };
  } catch { return { error: 'ffprobe JSON inválido' }; }
}
function fmtDuration(seconds) { if (!seconds) return '?'; const total = Math.round(seconds); return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`; }
function fmtSize(bytes) { return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${(bytes / 1024).toFixed(0)} KB`; }
function buildIndex(rootInner) {
  const ffprobe = findFfprobe();
  if (!ffprobe) throw new Error('ffprobe no encontrado: instala ffmpeg o define ffprobePath en la config');
  const files = listMedia(rootInner);
  return files.map((file) => ({ file, name: path.basename(file), ...probe(file, ffprobe) }));
}
function formatEntry(entry) { return `${entry.name} · ${fmtDuration(entry.duration)} · ${entry.width ? `${entry.width}x${entry.height}` : 'sin video'} · ${[entry.videoCodec, entry.audioCodec].filter(Boolean).join('/') || '?'} · ${fmtSize(entry.size)}${entry.error ? ` · ERROR ${entry.error}` : ''}`; }
function textResult(text) { return { content: [{ type: 'text', text }] }; }

function buildInstructions() {
  return [
    'Media Index: indexa y busca archivos de media locales con ffprobe.',
    '',
    'Herramientas: status, scan, search.',
    '',
    'Reglas:',
    '- Solo lectura; respeta allowedPaths.',
    '- Muestra duración, resolución, códecs y tamaño reales.',
    '- Si ffprobe falta, lo dice; no inventa metadatos.',
  ].join('\n');
}

function buildServer() {
  const server = new McpServer({ name: 'dsh-plugin-media-index', version: VERSION }, { capabilities: { tools: {} }, instructions: buildInstructions() });
  server.registerTool('status', { title: 'Estado', description: 'ffprobe, rutas y modo.', inputSchema: z.object({}) }, async () => textResult([`ffprobe: ${findFfprobe() || 'NO encontrado'}`, `Rutas permitidas: ${allowedRoots().join(', ')}`, 'Modo: solo lectura'].join('\n')));
  server.registerTool('scan', { title: 'Escanear media', description: 'Indexa archivos de media de una carpeta.', inputSchema: z.object({ path: z.string().min(2) }) }, async (args) => {
    const entries = buildIndex(args.path);
    if (entries.length === 0) return textResult('Sin archivos de media en la ruta.');
    return textResult([`Archivos: ${entries.length}`, '', ...entries.map((entry) => `- ${formatEntry(entry)}`)].join('\n'));
  });
  server.registerTool('search', { title: 'Buscar media', description: 'Busca por nombre o metadatos (codec, resolución, duración).', inputSchema: z.object({ path: z.string().min(2), query: z.string().min(1).max(120), limit: z.number().int().min(1).max(100).optional() }) }, async (args) => {
    const query = args.query.toLowerCase();
    const entries = buildIndex(args.path).filter((entry) => `${entry.name} ${entry.videoCodec || ''} ${entry.audioCodec || ''} ${entry.width || ''}x${entry.height || ''} ${Math.round(entry.duration)}s`.toLowerCase().includes(query)).slice(0, args.limit ?? 30);
    if (entries.length === 0) return textResult(`Sin resultados para "${args.query}".`);
    return textResult(entries.map((entry) => `- ${formatEntry(entry)}`).join('\n'));
  });
  return server;
}

try { mkdirSync(CACHE_DIR, { recursive: true }); } catch { /* ignora */ }
log('media-index listo');
serveStdio(buildServer, { onerror: (e) => log(`serveStdio: ${e.message}`) });
process.on('uncaughtException', (e) => log(`excepción: ${e.message}`));
process.on('unhandledRejection', (e) => log(`rechazo: ${e && e.message ? e.message : String(e)}`));
