# Project rules

- Never add a "Co-Authored-By: Claude" (or similar signature) line to git commit messages.
- **Production deploys**: push to GitHub first, then `git pull` on the server. Never use `scp` or copy files directly to production. See `.cursor/rules/production-deploy.mdc`.
