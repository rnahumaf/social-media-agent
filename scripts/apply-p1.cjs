// Temporary transport of the exact locally tested source. Removed before merge.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const encoded = [1, 2, 3, 4].map(n => fs.readFileSync(`scripts/p1-part${n}.b64`, 'utf8').trim()).join('');
const payload = zlib.brotliDecompressSync(Buffer.from(encoded, 'base64'));
if (hash(payload) !== '752d0c13652f7500f73582e7cee65b8376323505284dfe10a0b6b089a03c9a5b') throw Error('P1 transport checksum mismatch');
const lines = text => text.match(/[^\n]*\n|[^\n]+$/g) || [];
const files = JSON.parse(payload.toString('utf8'));
const prepared = files.map(file => {
  if (!/^(core|electron|src|tests|docs)\//.test(file.path) && !['README.md', 'package.json'].includes(file.path)) throw Error('Unexpected source path');
  if (file.path.split('/').includes('..')) throw Error('Invalid path');
  const exists = fs.existsSync(file.path);
  const before = exists ? fs.readFileSync(file.path, 'utf8').replace(/\r\n/g, '\n') : '';
  if (file.before === null ? exists : (!exists || hash(before) !== file.before)) throw Error('Source changed: ' + file.path);
  const result = lines(before);
  for (const [index, count, replacement] of [...file.edits].reverse()) result.splice(index, count, ...lines(replacement));
  const content = result.join('');
  if (hash(content) !== file.after) throw Error('Output checksum mismatch: ' + file.path);
  return {path: file.path, content};
});
for (const file of prepared) {
  fs.mkdirSync(path.dirname(file.path), {recursive: true});
  fs.writeFileSync(file.path, file.content, 'utf8');
  console.log('Verified and applied', file.path);
}
console.log(`Applied ${prepared.length} exact tested files.`);
