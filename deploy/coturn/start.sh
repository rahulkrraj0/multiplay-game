#!/bin/sh
set -eu
: "${PUBLIC_IP:?PUBLIC_IP is required}"
: "${TURN_USERNAME:?TURN_USERNAME is required}"
: "${TURN_PASSWORD:?TURN_PASSWORD is required}"
: "${TURN_REALM:?TURN_REALM is required}"

cat > /tmp/turnserver.conf <<EOF
listening-port=3478
listening-ip=0.0.0.0
fingerprint
lt-cred-mech
user=${TURN_USERNAME}:${TURN_PASSWORD}
realm=${TURN_REALM}
external-ip=${PUBLIC_IP}
min-port=49160
max-port=49200
total-quota=100
stale-nonce=600
no-multicast-peers
no-cli
no-tls
no-dtls
log-file=stdout
denied-peer-ip=0.0.0.0-0.255.255.255
denied-peer-ip=10.0.0.0-10.255.255.255
denied-peer-ip=100.64.0.0-100.127.255.255
denied-peer-ip=127.0.0.0-127.255.255.255
denied-peer-ip=169.254.0.0-169.254.255.255
denied-peer-ip=172.16.0.0-172.31.255.255
denied-peer-ip=192.0.0.0-192.0.0.255
denied-peer-ip=192.0.2.0-192.0.2.255
denied-peer-ip=192.168.0.0-192.168.255.255
denied-peer-ip=198.18.0.0-198.19.255.255
denied-peer-ip=198.51.100.0-198.51.100.255
denied-peer-ip=203.0.113.0-203.0.113.255
denied-peer-ip=240.0.0.0-255.255.255.255
EOF

exec turnserver -c /tmp/turnserver.conf --prod
