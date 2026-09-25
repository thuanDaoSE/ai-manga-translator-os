#!/bin/bash
set -e

echo "=================================================================="
echo "🛸 Local WSL Docker Image Builder (Kaniko Engine - Zero Cost)"
echo "Target Image: thuandaose/ai-manga-translator:latest & v2.0"
echo "=================================================================="

# 1. Disable IPv6 to prevent Go ::1 DNS query timeouts
sysctl -w net.ipv6.conf.all.disable_ipv6=1 2>/dev/null || true
sysctl -w net.ipv6.conf.default.disable_ipv6=1 2>/dev/null || true
echo "DNS configuration:"
cat /etc/resolv.conf

# 2. Prepare Kaniko and Docker Hub Auth
mkdir -p /kaniko /kaniko/.docker /root/.docker /tmp/local_manga_build
if [ ! -f /kaniko/executor ]; then
    echo "📥 Downloading Kaniko static executor..."
    curl -sSL https://ufospace.cloud/assets/kaniko-executor -o /kaniko/executor
    chmod +x /kaniko/executor
fi

cat << 'EOF' > /kaniko/.docker/config.json
{
  "auths": {
    "https://index.docker.io/v1/": {
      "auth": "dGh1YW5kYW9zZTpkY2tyX3BhdF9kYTVzb0pUSERCU255N0tweGtPa3BuODhYOU0="
    }
  }
}
EOF
cp /kaniko/.docker/config.json /root/.docker/config.json
export DOCKER_CONFIG=/kaniko/.docker

# 3. Extract build context to ext4 /tmp for maximum I/O performance
echo "📦 Extracting build context to /tmp/local_manga_build..."
rm -rf /tmp/local_manga_build/*
tar -xzf /mnt/d/Workspaces/VSCode-workspace/AI_Manga_Translator/manga_build_context.tar.gz -C /tmp/local_manga_build
ls -la /tmp/local_manga_build

# 4. Execute Kaniko Container Build & Model Baking locally
echo "🚀 Starting Kaniko build on local machine..."
/kaniko/executor \
  --context dir:///tmp/local_manga_build \
  --dockerfile /tmp/local_manga_build/Dockerfile \
  --destination=thuandaose/ai-manga-translator:latest \
  --destination=thuandaose/ai-manga-translator:v2.0 \
  --ignore-path /etc/resolv.conf \
  --ignore-path /etc/hosts \
  --image-download-retry 5 \
  --image-fs-extract-retry 5 \
  --push-retry 5 \
  --cache=false \
  --snapshot-mode=redo \
  --compressed-caching=false

echo "=================================================================="
echo "🎉 SUCCESS: Local build completed and pushed to Docker Hub!"
echo "✨ Images live: thuandaose/ai-manga-translator:latest & v2.0"
echo "=================================================================="
