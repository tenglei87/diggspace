# One-time release for corrected DiggSpace navigation

Deploy reviewed master via the trusted owner-only PR gate. Expected nav: 最新｜热搜｜资讯｜软件｜技术｜奇趣｜财富｜英文. Keep 78 curated RSS sources, hourly cron, no AIHOT, login, admin, discussion or following. This PR only triggers the release; the workflow explicitly checks out master. Close unmerged after verification, then remove the temporary release trigger.
