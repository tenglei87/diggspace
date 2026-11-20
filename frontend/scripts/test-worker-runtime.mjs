import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const frontend=fileURLToPath(new URL('../',import.meta.url));
const wrangler=fileURLToPath(new URL('../node_modules/wrangler/bin/wrangler.js',import.meta.url));
const base='http://127.0.0.1:18787';
const child=spawn(process.execPath,[wrangler,'dev','--local','--port','18787'],{
  cwd:frontend,env:{...process.env,CI:'true'},stdio:['ignore','pipe','pipe'],
});
let logs='',exited=false;
child.stdout.on('data',d=>logs=(logs+d.toString()).slice(-10000));
child.stderr.on('data',d=>logs=(logs+d.toString()).slice(-10000));
child.on('exit',()=>{exited=true});
const get=(path,opts={})=>fetch(base+path,{signal:AbortSignal.timeout(10000),...opts});
try{
 let ready=false;
 for(let attempt=0;attempt<100;attempt++){
  if(exited)throw Error('Wrangler crashed: '+logs);
  try{const r=await get('/');if(r.status===200){ready=true;break}}catch{}
  await new Promise(r=>setTimeout(r,300));
 }
 assert.ok(ready,'Worker ready: '+logs);
 const html=await (await get('/')).text();
 assert.match(html,/本地热搜测试文章/);
 assert.match(html,/本地资讯测试文章/);
 assert.match(html,/订阅 <strong>78<\/strong> 个来源/);
 assert.match(html,/<nav class="tabs" aria-label="主导航">/);
 // AIHOT is an external recommendation, not an internal feed category.
 assert.match(html, /<a href="https:\/\/aihot\.news\/" target="_blank" rel="noopener noreferrer">AI新闻资讯<\/a>/);
 assert.doesNotMatch(html, /<div class="section-head">/, 'latest timeline must not repeat its title');
 const navOrder=['最新','热搜','资讯','软件','技术','奇趣','财富','英文'];
 let previous=-1;
 for(const name of navOrder){
   const position=html.indexOf('>'+name+'</a>',html.indexOf('<nav class="tabs"'));
   assert.ok(position>previous,'nav order incorrect: '+name);
   previous=position;
 }
 // News titles can legitimately mention '登录' or '讨论'. Only the header
 // must be free of removed community and administrator navigation items.
 const header=html.match(/<header class="top">([\s\S]*?)<\/header>/)?.[1] || '';
 assert.ok(header,'top navigation header exists');
 for(const term of ['登录','讨论','我的关注','管理后台','AI资讯','AI日报','AI周报'])
   assert.doesNotMatch(header,new RegExp(term));
 const hot=await get('/c/hot'); assert.equal(hot.status,200);
 const hotHtml=await hot.text();
 assert.match(hotHtml,/本地热搜测试文章/);
 assert.match(hotHtml, /href="https:\/\/aihot\.news\/"[^>]*>AI新闻资讯<\/a>/);
 assert.doesNotMatch(hotHtml, /<div class="section-head">/, 'category timeline must not repeat 热搜 / 分类资讯');
 assert.doesNotMatch(hotHtml,/本地资讯测试文章/);
 const newsHtml=await (await get('/c/news')).text();
 assert.match(newsHtml,/本地资讯测试文章/);
 assert.doesNotMatch(newsHtml,/本地热搜测试文章/);
 assert.doesNotMatch(newsHtml, /<div class="section-head">/);
 for(const category of ['software','tech','fun','money','english']){
   const pageHtml=await (await get('/c/'+category)).text();
   assert.doesNotMatch(pageHtml, /<div class="section-head">/, 'repeated heading on '+category);
   assert.match(pageHtml, /href="https:\/\/aihot\.news\/"[^>]*>AI新闻资讯<\/a>/);
 }
 assert.equal((await get('/sources')).status,200);
 assert.match(await (await get('/sources')).text(),/RSS/);
 for(const path of ['/admin','/admin/login','/login','/discussions','/following',
    '/api/admin/feedspace/sources','/vote','/follow','/ai-hot','/ai-daily','/ai-weekly'])
   assert.equal((await get(path,{redirect:'manual'})).status,404,'removed route '+path);
 assert.equal((await get('/c/nonexistent')).status,404);
 assert.equal((await get('/sitemap.xml')).status,200);
 assert.equal((await get('/latest',{redirect:'manual'})).status,301);
 console.log('PASS: read-only Worker/D1, 78 feeds, all categories and no account/admin routes');
}catch(err){console.error(err);console.error('WRANGLER LOGS:\n'+logs);process.exitCode=1}
finally{if(!exited)child.kill('SIGTERM')}
