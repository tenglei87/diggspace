#!/usr/bin/env python3
"""FeedSpace admin CLI: change source groups and RSS feeds without touching Indi UI."""
import argparse
import json
import os
import sys
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen


def call(method, endpoint, payload=None):
    base = os.getenv("FEEDSPACE_URL", "").rstrip("/")
    token = os.getenv("FEEDSPACE_ADMIN_TOKEN", "")
    if not (base.startswith("https://") or base.startswith("http://localhost:") or
            base.startswith("http://127.0.0.1:")):
        sys.exit("FEEDSPACE_URL must use https (or localhost during development)")
    if not token:
        sys.exit("FEEDSPACE_ADMIN_TOKEN is missing")
    body = None if payload is None else json.dumps(payload, ensure_ascii=False).encode("utf-8")
    request = Request(
        base + "/api/admin/feedspace" + endpoint,
        data=body, method=method,
        headers={"Authorization": "Bearer " + token, "Accept": "application/json",
                 "Content-Type": "application/json"},
    )
    try:
        with urlopen(request, timeout=35) as response:
            print(json.dumps(json.loads(response.read()), ensure_ascii=False, indent=2))
    except HTTPError as exc:
        sys.exit("HTTP %s: %s" % (exc.code, exc.read().decode("utf-8", errors="replace")))
    except URLError as exc:
        sys.exit("Connection error: %s" % exc.reason)


def main():
    parser = argparse.ArgumentParser(description="Manage FeedSpace categories and RSS feeds")
    sub = parser.add_subparsers(dest="action", required=True)
    sub.add_parser("groups")
    x = sub.add_parser("add-group")
    x.add_argument("id"); x.add_argument("name")
    x = sub.add_parser("rename-group")
    x.add_argument("id"); x.add_argument("name")
    x = sub.add_parser("delete-group"); x.add_argument("id")
    x = sub.add_parser("sources"); x.add_argument("--group")
    x.add_argument("--limit", type=int, default=100)
    x = sub.add_parser("add-source")
    for k in ("name", "url", "feed", "group"):
        x.add_argument("--" + k, required=True)
    x.add_argument("--tags", default="")
    x = sub.add_parser("update-source")
    x.add_argument("num", type=int)
    for k in ("name", "url", "feed", "group"):
        x.add_argument("--" + k)
    x = sub.add_parser("disable-source"); x.add_argument("num", type=int)
    x = sub.add_parser("enable-source"); x.add_argument("num", type=int)
    args = parser.parse_args()

    if args.action == "groups":
        call("GET", "/groups")
    elif args.action == "add-group":
        call("POST", "/groups", {"id": args.id, "name": args.name})
    elif args.action == "rename-group":
        call("PATCH", "/groups/" + args.id, {"name": args.name})
    elif args.action == "delete-group":
        call("DELETE", "/groups/" + args.id)
    elif args.action == "sources":
        call("GET", "/sources?" + urlencode({"groupId": args.group or "", "limit": args.limit}))
    elif args.action == "add-source":
        call("POST", "/sources", {
            "name": args.name, "url": args.url, "feed": args.feed, "groupId": args.group,
            "tags": [s.strip() for s in args.tags.split(",") if s.strip()],
        })
    elif args.action == "update-source":
        data = {k: getattr(args, k) for k in ("name", "url", "feed")
                if getattr(args, k) is not None}
        if args.group is not None:
            data["groupId"] = args.group
        if not data:
            sys.exit("Specify at least one value to update")
        call("PATCH", "/sources/" + str(args.num), data)
    elif args.action == "disable-source":
        call("DELETE", "/sources/" + str(args.num))
    elif args.action == "enable-source":
        call("PATCH", "/sources/" + str(args.num), {"enabled": True})


if __name__ == "__main__":
    main()
