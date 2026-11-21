import assert from 'node:assert/strict';
const site=process.env.DIGGSPACE_URL;
if(site!=='https://digg.space')throw Error('Unexpected target');
const get=(path,opts={})=>fetch(site+path,{
  redirect:opts.redirect??'follow',signal:AbortSignal.timeout(15000),
  headers:{'Cache-Control':'no-cache'},
});
// Cloudflare may serve the previous Worker version's cached homepage for
// up to 30 seconds. Each attempt gets a unique cache key and checks the
// actual expected navigation before considering rollout successful.
const expectedNav=['最新','热搜','资讯','软件','技术','奇趣','财富'];
const correctNav=html=>{
  const navStart=html.indexOf('<nav class="tabs" aria-label="主导航">');
  if(navStart<0)return false;
  let previous=navStart;
  for(const name of expectedNav){
    const position=html.indexOf('>'+name+'</a>',navStart);
    if(position<=previous)return false;
    previous=position;
  }
  return true;
};
let response,html='';
for(let i=0;i<12;i++){
 try{
   const unique='/\u003fverify=readonly-news-'+
     (process.env.GITHUB_RUN_ID||'local')+'-'+Date.now()+'-'+i;
   response=await get(unique);
   if(response.status===200){
     html=await response.text();
     if(correctNav(html))break;
   }
 }catch(error){console.warn('Waiting for Worker rollout:',error.message)}
 await new Promise(r=>setTimeout(r,1500));
}
assert.equal(response?.status,200,'homepage responds');
assert.ok(correctNav(html),'updated navigation did not propagate after cache-bypassed retries');
assert.match(html,/<nav class="tabs" aria-label="主导航">/);
let previous=-1;
for(const name of ['最新','热搜','资讯','软件','技术','奇趣','财富']){
 const position=html.indexOf('>'+name+'</a>',html.indexOf('<nav class="tabs"'));
 assert.ok(position>previous,'production nav order incorrect: '+name);
 previous=position;
}
for(const [cat,label] of [['hot','热搜'],['news','资讯'],['software','软件'],['tech','技术'],
 ['fun','奇趣'],['money','财富']]){
 assert.match(html,new RegExp('href="/c/'+cat+'"[^>]*>'+label+'</a>'));
 // Existing category pages may briefly be served from Cloudflare's former
 // Worker or cached SSR output after a deployment. Check the actual new
 // markup, not merely HTTP 200, and retry each category with a unique key.
 let categoryStatus=0,categoryHTML='',categoryReady=false;
 for(let attempt=0;attempt<24;attempt++){
   const unique='/c/'+cat+'?verify=slim-sidebar-'+
     (process.env.GITHUB_RUN_ID||'local')+'-'+Date.now()+'-'+attempt;
   try{
     const categoryResult=await get(unique);
     categoryStatus=categoryResult.status;
     if(categoryStatus===200){
       categoryHTML=await categoryResult.text();
       categoryReady=!categoryHTML.includes('<div class="section-head">') &&
         categoryHTML.includes('>AI新闻资讯</a>') &&
         !categoryHTML.includes('<p class="about">') &&
         !categoryHTML.includes('上次成功抓取');
       if(categoryReady)break;
     }
   }catch(error){console.warn('Waiting for category '+cat+': '+error.message)}
   await new Promise(r=>setTimeout(r,1500));
 }
 assert.equal(categoryStatus,200,'category '+cat);
 assert.ok(categoryReady,'new version for category '+cat+' has not propagated');
 assert.doesNotMatch(categoryHTML, /<div class="section-head">/,
   'category '+cat+' should not repeat title and 分类资讯');
 assert.match(categoryHTML, /href="https:\/\/aihot\.news\/"[^>]*>AI新闻资讯<\/a>/);
 assert.doesNotMatch(categoryHTML, /<p class="about">|上次成功抓取/);
}
assert.match(html,/订阅 <strong>68<\/strong> 个来源/);
assert.match(html, /<a href="https:\/\/aihot\.news\/" target="_blank" rel="noopener noreferrer">AI新闻资讯<\/a>/);
assert.doesNotMatch(html, /<div class="section-head">/, 'latest must show articles directly');
assert.doesNotMatch(html, /<p class="about">|上次成功抓取/, 'right sidebar must not show legacy helper text');
// Article titles and summaries can legitimately contain words such as 讨论,
// 登录 or AI资讯. Check the actual site header, never the editorial content.
const header=html.match(/<header class="top">([\s\S]*?)<\/header>/)?.[1] || '';
assert.ok(header,'top navigation header exists');
for(const phrase of ['登录','讨论','我的关注','管理后台','AI资讯'])
 assert.doesNotMatch(header,new RegExp(phrase),'retired top navigation: '+phrase);
assert.equal((await get('/sources')).status,200);
assert.equal((await get('/c/english?verify=retired-english-'+Date.now())).status,404);
const sourcesHTML=await (await get('/sources?verify=retired-english-'+Date.now())).text();
assert.doesNotMatch(sourcesHTML, /href="\/c\/english"/);
if(html.includes('class="item"'))
 assert.match(html, /class="source-icon"[\s\S]*?\/favicon\.ico"/, 'article favicon displayed');
for(const path of ['/admin','/admin/login','/login','/discussions','/following',
 '/api/admin/feedspace/sources','/api/admin/crawl','/ai-hot','/ai-daily','/ai-weekly']){
 const r=await get(path);assert.equal(r.status,404,'retired endpoint: '+path);
}
console.log('PASS: production RSS reader, 68 sources, seven tabs, legacy admin and community routes removed');
