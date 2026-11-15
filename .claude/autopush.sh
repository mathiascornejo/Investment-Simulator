#!/bin/sh
# Stop hook: commit and push whatever changed this turn. Pushing to main redeploys the site.
cd "$CLAUDE_PROJECT_DIR" || exit 0
[ -n "$(git status --porcelain)" ] || exit 0
git add -A
git commit -q -m "Auto-commit: $(git diff --cached --name-only | head -3 | tr '\n' ' ')

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
git push -q origin HEAD 2>&1 | tail -2
exit 0
