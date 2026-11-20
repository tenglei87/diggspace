INSERT OR IGNORE INTO news_sources
 (id, category, name, site_url, feed_url, enabled, next_check_at)
 VALUES
 ('r-20c43f0b','hot','知乎热榜','https://www.zhihu.com','https://plink.anyfeeder.com/zhihu/hotlist',1,0),
 ('r-d47fbdcf','news','爱范儿','https://www.ifanr.com','https://www.ifanr.com/feed',1,0);
INSERT OR IGNORE INTO news_items (source_id,url,title,summary,published_at,first_seen_at)
 VALUES
 ('r-20c43f0b','https://example.com/hot/1','本地热搜测试文章','热点来源测试',unixepoch()-120,unixepoch()),
 ('r-d47fbdcf','https://example.com/news/1','本地资讯测试文章','资讯来源测试',unixepoch()-300,unixepoch());
