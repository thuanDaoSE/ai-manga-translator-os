set -e
echo "=== 1. Extracting Update Files ==="
mkdir -p /root/build && cd /root/build
tar -xzf /root/manga_layer_update.tar.gz
ls -la /root/build

echo "=== 2. Configuring Docker Hub Credentials ==="
mkdir -p /kaniko/.docker
cat << 'EOF' > /kaniko/.docker/config.json
{
    "auths": {
        "https://index.docker.io/v1/": {
            "auth": "dGh1YW5kYW9zZTpkY2tyX3BhdF9kYTVzb0pUSERCU255N0tweGtPa3BuODhYOU0="
        }
    }
}
EOF

echo "=== 3. Fetching Official Kaniko Executor & SSL Certs ==="
mkdir -p /kaniko/ssl/certs
if [ ! -f /etc/ssl/certs/ca-certificates.crt ]; then
  apt-get update && apt-get install -y --no-install-recommends ca-certificates curl
fi
cp /etc/ssl/certs/ca-certificates.crt /kaniko/ssl/certs/ca-certificates.crt || true
export SSL_CERT_DIR=/kaniko/ssl/certs
export SSL_CERT_FILE=/kaniko/ssl/certs/ca-certificates.crt

if [ ! -f /usr/local/bin/kaniko ]; then
  curl -fsSL https://github.com/GoogleContainerTools/kaniko/releases/download/v1.23.2/executor-linux-amd64 -o /usr/local/bin/kaniko
  chmod +x /usr/local/bin/kaniko
fi

echo "=== 4. Building Layer Diff and Pushing to Docker Hub ==="
/usr/local/bin/kaniko \
  --context=/root/build \
  --dockerfile=/root/build/Dockerfile.update \
  --destination=thuandaose/ai-manga-translator:latest \
  --destination=thuandaose/ai-manga-translator:v2.0 \
  --snapshot-mode=redo \
  --compressed-caching=false \
  --use-new-run=false

echo "=== 5. Verification: Image Layer Pushed Successfully ==="
