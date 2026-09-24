#!/bin/bash

set -u

PROJECT_DIR="${PROJECT_DIR:-/home/z/my-project}"
BUILD_DIR="${BUILD_DIR:-}"
DATABASE_URL="${DATABASE_URL:-}"

# The app runs on external PostgreSQL (Neon) — no SQLite file is bundled into
# the deployment package anymore. This step keeps the target database schema in
# sync with prisma/schema.prisma whenever DATABASE_URL points to Postgres.
if [ -z "$DATABASE_URL" ] || [[ "$DATABASE_URL" != postgresql://* ]]; then
    echo "ℹ️  未提供 PostgreSQL DATABASE_URL，跳过数据库结构同步（将由运行时/外部管理）"
    exit 0
fi

cd "$PROJECT_DIR" || exit 1

echo "🗄️  同步数据库结构到 PostgreSQL ($(echo "$DATABASE_URL" | sed -E 's#postgresql://[^@]+@#postgresql://***@#'))..."

if DATABASE_URL="$DATABASE_URL" bunx prisma db push --skip-generate --accept-data-loss; then
    echo "✅ 数据库结构同步完成"
else
    echo "❌ 数据库结构同步失败；请检查 DATABASE_URL 与网络连通性"
    exit 1
fi