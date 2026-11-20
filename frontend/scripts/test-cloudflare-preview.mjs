import assert from 'node:assert/strict';
const site=process.env.DIGGSPACE_URL;
if(site!=='https://digg.space')throw Error('Unexpected target');
const get=(path,opts={})=>fetch(site+path,{
  redirect:opts.redirect??'follow',signal:AbortSignal.timeout(15000),
  headers:{'Cache-Control':'no-cache'},
});
let response;
for(let i=0;i<6;i++){
 try{response=await get('/?verify=readonly-news-20261120');
   if(response.status===200)break;
 }catch{}
 await new Promise(r=>setTimeout(r,1200));
}
assert.equal(response?.status,200,'homepage responds');
const html=await response.text();
assert.match(html,/<nav class="tabs" aria-label="主导航">/);
for(const [cat,label] of [['hot','热搜'],['news','资讯'],['software','软件'],
 ['fun','奇趣'],['money','财富'],['english','英文'],['tech','技术']]){
 assert.match(html,new RegExp('href="/c/'+cat+'"[^>]*>'+label+'</a>'));
 assert.equal((await get('/c/'+cat)).status,200,'category '+cat);
}
assert.match(html,/订阅 <strong>78<\/strong> 个来源/);
for(const phrase of ['登录','讨论','我的关注','管理后台','AI资讯'])
 assert.doesNotMatch(html,new RegExp(phrase));
assert.equal((await get('/sources')).status,200);
for(const path of ['/admin','/admin/login','/login','/discussions','/following',
 '/api/admin/feedspace/sources','/api/admin/crawl','/ai-hot','/ai-daily','/ai-weekly']){
 const r=await get(path);assert.equal(r.status,404,'retired endpoint: '+path);
}
console.log('PASS: production RSS reader, 78 sources, eight tabs, legacy admin and community routes removed');
