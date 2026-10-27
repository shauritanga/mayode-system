# MAYODE source handover

`mayode-source-code-handover.zip` is a source-only snapshot for owner review. It includes backend, mobile and portal source, the backend Prisma schema and migrations, package manifests, and the two owner-facing technical documents.

It excludes `.env` files, secrets, dependency folders, uploads, generated builds and Git history. Install dependencies and provide environment-specific configuration separately before running any component.

Verify the archive with `shasum -a 256 -c ARCHIVE_SHA256.txt`. Verify files extracted from the archive with `shasum -a 256 -c SOURCE_SHA256SUMS.txt` from the extracted package root.

The hashes confirm package integrity; they do not prove authorship. Preserve the original Git repository and release commit for authorship and provenance.
