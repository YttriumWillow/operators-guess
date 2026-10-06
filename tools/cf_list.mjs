/* 读取本机 wrangler OAuth token（不输出），列出账户下 Workers 与 Pages 项目 */
import fs from 'node:fs';

const cfgPath = process.env.APPDATA + '/xdg.config/.wrangler/config/default.toml';
const toml = fs.readFileSync(cfgPath, 'utf8');
const m = toml.match(/oauth_token\s*=\s*"([^"]+)"/);
if (!m) throw new Error('no oauth token');
const token = m[1];

const ACCOUNT = '6578c217c82727d0fa17c311732fd5b9';
const api = async path => {
  const r = await fetch('https://api.cloudflare.com/client/v4/accounts/' + ACCOUNT + path, {
    headers: { Authorization: 'Bearer ' + token },
  });
  return r.json();
};

const workers = await api('/workers/scripts');
console.log('--- Workers scripts ---');
if (workers.result) {
  for (const w of workers.result) console.log(w.id, '| modified:', w.modified_on);
} else {
  console.log(JSON.stringify(workers).slice(0, 500));
}

const pages = await api('/pages/projects');
console.log('--- Pages projects ---');
if (pages.result) {
  for (const p of pages.result) {
    console.log(p.name, '| subdomain:', p.subdomain, '| domains:', (p.domains || []).join(','));
  }
} else {
  console.log(JSON.stringify(pages).slice(0, 500));
}

const sub = await api('/workers/subdomain');
console.log('--- workers.dev subdomain ---');
console.log(JSON.stringify(sub.result));
