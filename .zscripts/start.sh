#!/bin/sh

set -e

# 获取脚本所在目录
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BUILD_DIR="$SCRIPT_DIR"

# 存储所有子进程的 PID
pids=""

# 清理函数：优雅关闭所有服务
cleanup() {
    echo ""
    echo "🛑 正在关闭所有服务..."
    
    # 发送 SIGTERM 信号给所有子进程
    for pid in $pids; do
        if kill -0 "$pid" 2>/dev/null; then
            service_name=$(ps -p "$pid" -o comm= 2>/dev/null || echo "unknown")
            echo "   关闭进程 $pid ($service_name)..."
            kill -TERM "$pid" 2>/dev/null
        fi
    done
    
    # 等待所有进程退出（最多等待 5 秒）
    sleep 1
    for pid in $pids; do
        if kill -0 "$pid" 2>/dev/null; then
            # 如果还在运行，等待最多 4 秒
            timeout=4
            while [ $timeout -gt 0 ] && kill -0 "$pid" 2>/dev/null; do
                sleep 1
                timeout=$((timeout - 1))
            done
            # 如果仍然在运行，强制关闭
            if kill -0 "$pid" 2>/dev/null; then
                echo "   强制关闭进程 $pid..."
                kill -KILL "$pid" 2>/dev/null
            fi
        fi
    done
    
    echo "✅ 所有服务已关闭"
    exit 0
}

echo "🚀 开始启动所有服务..."
echo ""

# 切换到构建目录
cd "$BUILD_DIR" || exit 1

ls -lah

# DB 由外部 PostgreSQL (Neon) 提供，部署包不再内置 SQLite 文件。
# DATABASE_URL 必须在运行环境中提供（如 Neon 的 postgresql://… 连接串）。
# ─────────────────────────────────────────────────────────────
# Python 依赖在构建阶段安装进部署产物，不复用 Sandbox 的 /home/z/.venv。
# Next.js 及其启动的子进程都会继承这组路径。
if [ -d "/app/python-runtime/site-packages" ]; then
    export PYTHONPATH="/app/python-runtime/site-packages:/app/next-service-dist${PYTHONPATH:+:$PYTHONPATH}"
    export PATH="/app/python-runtime/site-packages/bin:$PATH"
    export PYTHONDONTWRITEBYTECODE=1
    export PYTHONUNBUFFERED=1
    echo "🐍 已启用部署包内 Python runtime: $(python --version 2>&1)"
fi

# 启动 Next.js 服务器
if [ -f "./next-service-dist/server.js" ]; then
    echo "🚀 启动 Next.js 服务器..."
    cd next-service-dist/ || exit 1
    
    # 设置环境变量
    export NODE_ENV=production
    export PORT="${PORT:-3000}"
    export HOSTNAME="${HOSTNAME:-0.0.0.0}"

    # DATABASE_URL (PostgreSQL/Neon) 为必填
    if [ -z "$DATABASE_URL" ] || [[ "$DATABASE_URL" != postgresql://* ]]; then
        echo "❌ 未提供 PostgreSQL 数据库连接串（DATABASE_URL，如 postgresql://…Neon…）"
        echo "   为避免生产环境启动到空数据库，启动已终止"
        exit 1
    fi
    echo "🗄️  数据库: PostgreSQL ($(echo "$DATABASE_URL" | sed -E 's#postgresql://[^@]+@#postgresql://***@#'))"

    # Z.ai API credentials for live AI task prioritization. Override them in the
    # runtime environment if needed; the API key is intentionally NOT hardcoded
    # here, so without it the panel falls back to deadline ordering.
    export ZAI_BASE_URL="${ZAI_BASE_URL:-https://api.z.ai/api/paas/v4}"
    export ZAI_MODEL="${ZAI_MODEL:-glm-4.5-flash}"
    export ZAI_TIMEOUT_MS="${ZAI_TIMEOUT_MS:-60000}"
    export ZAI_API_KEY="${ZAI_API_KEY:-}"
    if [ -n "$ZAI_API_KEY" ]; then
        echo "🤖 已启用 Z.ai AI 任务优先级排序 (模型: $ZAI_MODEL)"
    else
        echo "⚠️  未设置 ZAI_API_KEY，AI 任务优先级排序不可用，将使用截止日期回退排序"
    fi

    # 数据库结构在部署构建阶段（database-runtime-build.sh）已同步到 PostgreSQL，
    # 此处不再执行，避免在精简容器内下载 Prisma CLI。
    
    # 后台启动 Next.js
    bun server.js &
    NEXT_PID=$!
    pids="$NEXT_PID"
    
    # 等待一小段时间检查进程是否成功启动
    sleep 1
    if ! kill -0 "$NEXT_PID" 2>/dev/null; then
        echo "❌ Next.js 服务器启动失败"
        exit 1
    else
        echo "✅ Next.js 服务器已启动 (PID: $NEXT_PID, Port: $PORT)"
    fi
    
    cd ../
else
    echo "⚠️  未找到 Next.js 服务器文件: ./next-service-dist/server.js"
fi

# 启动 mini-services
if [ -f "./mini-services-start.sh" ]; then
    echo "🚀 启动 mini-services..."
    
    # 运行启动脚本（从根目录运行，脚本内部会处理 mini-services-dist 目录）
    sh ./mini-services-start.sh &
    MINI_PID=$!
    pids="$pids $MINI_PID"
    
    # 等待一小段时间检查进程是否成功启动
    sleep 1
    if ! kill -0 "$MINI_PID" 2>/dev/null; then
        echo "⚠️  mini-services 可能启动失败，但继续运行..."
    else
        echo "✅ mini-services 已启动 (PID: $MINI_PID)"
    fi
elif [ -d "./mini-services-dist" ]; then
    echo "⚠️  未找到 mini-services 启动脚本，但目录存在"
else
    echo "ℹ️  mini-services 目录不存在，跳过"
fi

# 启动 Caddy（如果存在 Caddyfile）
echo "🚀 启动 Caddy..."

# Caddy 作为前台进程运行（主进程）
echo "✅ Caddy 已启动（前台运行）"
echo ""
echo "🎉 所有服务已启动！"
echo ""
echo "💡 按 Ctrl+C 停止所有服务"
echo ""

# Caddy 作为主进程运行
exec caddy run --config Caddyfile --adapter caddyfile
