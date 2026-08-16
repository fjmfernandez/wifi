#!/bin/sh
set -eu

# Compose enables a tiny init as PID 1, so check the actual daemon.  The
# entrypoint already performed the one-time, secret-safe configuration check.
pgrep -x freeradius >/dev/null
