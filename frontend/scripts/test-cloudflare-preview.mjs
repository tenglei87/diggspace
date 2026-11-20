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
const expectedNav=['最新','热搜','资讯','软件','技术','奇趣','财富','英文'];
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
for(const name of ['最新','热搜','资讯','软件','技术','奇趣','财富','英文']){
 const position=html.indexOf('>'+name+'</a>',html.indexOf('<nav class="tabs"'));
 assert.ok(position>previous,'production nav order incorrect: '+name);
 previous=position;
}
for(const [cat,label] of [['hot','热搜'],['news','资讯'],['software','软件'],['tech','技术'],
 ['fun','奇趣'],['money','财富'],['english','英文']]){
 assert.match(html,new RegExp('href="/c/'+cat+'"[^>]*>'+label+'</a>'));
 const categoryResult=await get('/c/'+cat+'?verify=external-link-'+Date.now()+'-'+cat);
 assert.equal(categoryResult.status,200,'category '+cat);
 const categoryHTML=await categoryResult.text();
 assert.doesNotMatch(categoryHTML, /<div class="section-head">/,
   'category '+cat+' should not repeat title and 分类资讯');
 assert.match(categoryHTML, /href="https:\/\/aihot\.news\/"[^>]*>AI新闻资讯<\/a>/);
}
assert.match(html,/订阅 <strong>78<\/strong> 个来源/);
assert.match(html, /<a href="https:\/\/aihot\.news\/" target="_blank" rel="noopener noreferrer">AI新闻资讯<\/a>/);
assert.doesNotMatch(html, /<div class="section-head">/, 'latest must show articles directly');
// Article titles and summaries can legitimately contain words such as 讨论,
// 登录 or AI资讯. Check the actual site header, never the editorial content.
const header=html.match(/<header class="top">([\s\S]*?)<\/header>/)?.[1] || '';
assert.ok(header,'top navigation header exists');
for(const phrase of ['登录','讨论','我的关注','管理后台','AI资讯'])
 assert.doesNotMatch(header,new RegExp(phrase),'retired top navigation: '+phrase);
assert.equal((await get('/sources')).status,200);
for(const path of ['/admin','/admin/login','/login','/discussions','/following',
 '/api/admin/feedspace/sources','/api/admin/crawl','/ai-hot','/ai-daily','/ai-weekly']){
 const r=await get(path);assert.equal(r.status,404,'retired endpoint: '+path);
}
console.log('PASS: production RSS reader, 78 sources, eight tabs, legacy admin and community routes removed');
