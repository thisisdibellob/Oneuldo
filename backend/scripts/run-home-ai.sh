#!/usr/bin/env bash
set -euo pipefail

backend_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if [[ "$(uname -s)" == Darwin ]]; then
    for candidate in /opt/homebrew/opt/openjdk@25/libexec/openjdk.jdk/Contents/Home /usr/local/opt/openjdk@25/libexec/openjdk.jdk/Contents/Home; do
        if [[ -x "$candidate/bin/javac" ]]; then
            export JAVA_HOME="$candidate"
            break
        fi
    done
fi
if [[ -n "${JAVA_HOME:-}" ]]; then
    export PATH="$JAVA_HOME/bin:$PATH"
fi
cd "$backend_dir"
# Keep the Mac's local backend awake while it waits for long remote AI requests.
# The assertion ends with Gradle; system power settings are not changed.
if [[ "$(uname -s)" == Darwin ]] && command -v caffeinate >/dev/null 2>&1; then
    exec caffeinate -i ./gradlew bootRun --args='--spring.profiles.active=ollama --spring.config.additional-location=optional:file:./local.properties' "$@"
fi
exec ./gradlew bootRun --args='--spring.profiles.active=ollama --spring.config.additional-location=optional:file:./local.properties' "$@"
