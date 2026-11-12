// Test end-to-end de media-index con ffprobe.
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';

const packageDir = path.resolve(import.meta.dirname, '..');
const tmpDir = path.join(packageDir, 'test', 'tmp');
rmSync(tmpDir, { recursive: true, force: true });
const home = path.join(tmpDir, 'dsh-home');
const media = path.join(tmpDir, 'media');
mkdirSync(path.join(home, 'media-index'), { recursive: true });
mkdirSync(media, { recursive: true });
writeFileSync(path.join(home, 'media-index', 'config.json'), JSON.stringify({ allowedPaths: [tmpDir] }), 'utf8');
if (spawnSync('ffmpeg', ['-version'], { encoding: 'utf8' }).status !== 0) { console.log('ffmpeg no disponible; test omitido (OK)'); process.exit(0); }
const make = (args, label) => { const result = spawnSync('ffmpeg', ['-y', '-v', 'error', ...args], { encoding: 'utf8' }); if (result.status !== 0) throw new Error(`${label}: ${result.stderr}`); };
make(['-f', 'lavfi', '-i', 'testsrc=duration=1:size=160x120:rate=10', '-pix_fmt', 'yuv420p', path.join(media, 'video.mp4')], 'mp4');
make(['-f', 'lavfi', '-i', 'sine=frequency=440:duration=1', path.join(media, 'audio.wav')], 'wav');

function makeClient() {
  const entry = process.env.MEDIAINDEX_SERVER ? path.resolve(process.env.MEDIAINDEX_SERVER) : path.join(packageDir, 'server.mjs');
  const transport = new StdioClientTransport({ command: process.execPath, args: [entry], env: { SystemRoot: process.env.SystemRoot || 'C:\\Windows', PATH: process.env.PATH, USERPROFILE: process.env.USERPROFILE, HOME: process.env.HOME || process.env.USERPROFILE, TEMP: process.env.TEMP, TMP: process.env.TMP, DSH_HOME: home }, stderr: 'pipe' });
  transport.stderr?.on('data', (c) => process.stderr.write(`[server] ${c}`));
  const client = new Client({ name: 'mediaindex-test', version: '1.0.0' }, { capabilities: {}, versionNegotiation: { mode: 'auto' } });
  return client.connect(transport).then(() => ({ client, transport }));
}
const textOf = (r) => (r.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n');

const { client, transport } = await makeClient();
console.log('tools:', (await client.listTools()).tools.map((t) => t.name).join(', '));
const status = textOf(await client.callTool({ name: 'status', arguments: {} }));
console.log('--- status ---'); console.log(status);
console.log('ffprobe detectado:', status.includes('ffprobe') && !status.includes('NO encontrado'));
const scan = textOf(await client.callTool({ name: 'scan', arguments: { path: media } }));
console.log('--- scan ---'); console.log(scan);
console.log('2 archivos:', scan.includes('Archivos: 2'));
console.log('video con resolución y codec:', scan.includes('video.mp4') && scan.includes('160x120') && scan.includes('h264'));
console.log('audio detectado:', scan.includes('audio.wav') && scan.includes('pcm'));
console.log('duración:', scan.includes('0:01'));
const search = textOf(await client.callTool({ name: 'search', arguments: { path: media, query: '160x120' } }));
console.log('search resolución:', search.includes('video.mp4') && !search.includes('audio.wav'));
const searchAudio = textOf(await client.callTool({ name: 'search', arguments: { path: media, query: 'wav' } }));
console.log('search nombre:', searchAudio.includes('audio.wav'));
const outside = await client.callTool({ name: 'scan', arguments: { path: 'C:\\Windows' } });
console.log('ruta fuera isError:', outside.isError === true);
await client.close(); try { await transport.close?.(); } catch {}
console.log('OK');
