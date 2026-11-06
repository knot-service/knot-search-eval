#!/bin/zsh
set -eu
app_dir="/Users/yongtae/Desktop/knot-search-eval"
backend_dir="/Users/yongtae/Desktop/knot/backend"
work_dir="$backend_dir/resume/search-eval/local-runner"
compose_file="$work_dir/compose.yml"
app_url="http://127.0.0.1:3000"
cd "$app_dir"
if ! docker info >/dev/null 2>&1; then
  echo 'Docker Desktop을 켠 다음 다시 실행해 주세요.'
  exit 1
fi
app_running=false
if curl -fsS --max-time 2 "$app_url/" | rg -q '탐색 평가 워크스페이스|Knot · 탐색 평가'; then
  app_running=true
  if [ "${1:-}" != "--rebuild" ]; then
    echo '이미 실행 중인 평가 화면을 엽니다.'
    open "$app_url/"
    exit 0
  fi
fi
if [ "$app_running" = false ] && lsof -nP -iTCP:3000 -sTCP:LISTEN >/dev/null 2>&1; then
  echo '3000번 포트를 다른 프로그램이 사용 중입니다.'
  exit 1
fi
if [ ! -f "$backend_dir/.env.search-local" ] || [ ! -f "$app_dir/.env.local" ]; then
  echo '로컬 평가 환경 설정을 찾지 못했습니다.'
  exit 1
fi
mkdir -p "$work_dir/contexts"
context_dir=$(mktemp -d "$work_dir/contexts/build.XXXXXX")
rsync -a --exclude='application-local.properties' "$backend_dir/src" "$backend_dir/gradle" "$backend_dir/build.gradle" "$backend_dir/settings.gradle" "$backend_dir/gradlew" "$backend_dir/Dockerfile.search-local" "$context_dir/"
runtime_file="$context_dir/compose.yml"
sed "s|context: ./context|context: $context_dir|" "$compose_file" > "$runtime_file"
echo '최신 로컬 백엔드와 분리된 평가 DB를 준비합니다. 첫 실행은 시간이 걸릴 수 있습니다.'
docker compose -f "$runtime_file" up -d --build
if [ "$app_running" = true ]; then
  echo '백엔드 빌드를 반영했습니다. 평가 화면을 엽니다.'
  open "$app_url/"
  exit 0
fi
model=$(awk -F= '$1=="LLM_MODEL" {print substr($0,index($0,"=")+1)}' "$backend_dir/.env.search-local")
( for attempt in {1..90}; do
    if curl -fsS --max-time 2 "$app_url/" >/dev/null 2>&1; then open "$app_url/"; exit 0; fi
    sleep 1
  done
  echo '평가 화면이 아직 시작되지 않았습니다. 이 터미널의 오류를 확인해 주세요.'
) &
echo '평가 화면을 시작합니다. 이 터미널을 켜 두면 실험실을 사용할 수 있습니다.'
DATABASE_URL="postgresql://knot_eval:local-eval-only@127.0.0.1:55440/knot_eval" LOCAL_EVAL_ENABLED=1 LOCAL_EVAL_MODEL="${model:-확인 필요}" npm run dev -- --hostname 127.0.0.1
