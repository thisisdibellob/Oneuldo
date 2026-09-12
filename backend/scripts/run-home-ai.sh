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
exec ./gradlew bootRun --args='--spring.profiles.active=ollama --spring.config.additional-location=optional:file:./local.properties' "$@"
