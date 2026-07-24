// Divide tmp/gabarito-candidates.json em lotes tmp/gab-batches/batch-NNN.json.
import fs from 'node:fs';
const size = Number(process.argv[2] || 8);
const all = JSON.parse(fs.readFileSync('tmp/gabarito-candidates.json', 'utf8'));
fs.rmSync('tmp/gab-batches', { recursive: true, force: true });
fs.mkdirSync('tmp/gab-batches', { recursive: true });
let n = 0;
for (let i = 0; i < all.length; i += size) {
  const idx = String(n).padStart(3, '0');
  fs.writeFileSync(`tmp/gab-batches/batch-${idx}.json`, JSON.stringify(all.slice(i, i + size), null, 0));
  n += 1;
}
console.log(JSON.stringify({ total: all.length, batches: n, size }));
