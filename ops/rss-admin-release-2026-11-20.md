# Trusted one-time DiggSpace admin release

This PR is an operator audit/trigger only; deployment workflow explicitly checks out reviewed master.

Scope: apply D1 migration 0012 to retire 1609 CSV imported subscriptions, restore only Latest / Discussions / Following tabs, provide Indi external link, deploy secure /admin source-management UI, and verify site. No unreviewed branch code is deployed. Automatic RSS crawl remains disabled.

Close unmerged after deployment; remove temporary PR trigger immediately after.
