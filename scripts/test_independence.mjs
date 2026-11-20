import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
const root=resolve(import.meta.dirname,'..');
const get=file=>readFileSync(resolve(root,file),'utf8');
const worker=get('frontend/worker/index.js');
const catalog=get('frontend/worker/catalog.js');
const cron=get('frontend/wrangler.jsonc');
const workflow=get('.github/workflows/deploy_diggspace.yml');
if(/registerAuth|registerDiscuss|registerAdmin|hasAdminSession|ADMIN_TOKEN|\/api\/admin|\.\/auth\.js|\.\/discuss\.js|\.\/admin-panel/.test(worker))
  throw Error('Authentication or admin handler leaked into public Worker');
if(/aihot\.news|AI资讯|AI日报|AI周报/.test(catalog))throw Error('Removed AIHOT source present');
if(/DIGGSPACE_ADMIN_TOKEN|wrangler secret put ADMIN_TOKEN/.test(workflow))
  throw Error('Deployment must not install admin credential');
if(!cron.includes('"crons": ["7 * * * *"]'))throw Error('Hourly feed cron is required');
if(!cron.includes('00000000-0000-0000-0000-000000000000')||cron.includes('"routes"'))
  throw Error('Default config must not contain real D1 ID or a claimed domain');
if(existsSync(resolve(root,'data/initial-blogs.csv')))throw Error('Retired Indi blog catalog reintroduced');
console.log('PASS: standalone read-only news Worker and code-only feeds, hourly cron, no admin endpoints');
