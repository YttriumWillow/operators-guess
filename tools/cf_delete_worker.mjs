/* 删除误建的同名 Worker（进程内读取 OAuth token，不输出凭据） */
import fs from 'node:fs';

const toml = fs.readFileSync(process.env.APPDATA + '/xdg.config/.wrangler/config/default.toml', 'utf8');
const token = toml.match(/oauth_token\s*=\s*"([^"]+)"/)[1];
const ACCOUNT = '6578c217c82727d0fa17c311732fd5b9';

const r = await fetch(
  `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/workers/scripts/operators-guess`,
  { method: 'DELETE', headers: { Authorization: 'Bearer ' + token } });
const j = await r.json();
console.log('delete worker:', j.success ? 'success' : JSON.stringify(j));
