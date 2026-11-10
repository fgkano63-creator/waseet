const fs = require('fs');
const html = fs.readFileSync('schedule_v1.html', 'utf8');
const rx = /<meta\s+name=["']viewport["']\s+content=["'][^"']*width=device-width[^"']*initial-scale=1/i;
console.log('regex test:', rx.test(html));
const match = html.match(/<meta[^>]*viewport[^>]*>/i);
console.log('found viewport tag:', match ? match[0] : 'NONE');
