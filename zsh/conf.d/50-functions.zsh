# Utility functions and wrappers.

omxnew() {
  command cmux omx --madmax --high "$@"
}


claude() {
  TERM_PROGRAM=iTerm.app command claude --dangerously-skip-permissions "$@"
}

# gjc --tmux 가 매번 "새 전용 tmux 세션"을 만들도록 강제한다.
# 기본 동작: gjc --tmux 는 같은 project+branch 의 기존 GJC 세션을 찾아 재사용(attach)한다.
# 그 세션이 다른 탭에 붙어있으면 가로채기/detach 처럼 보인다. 고유한 GJC_TMUX_SESSION 을
# 지정하면 그 이름의 세션이 없으므로 재사용을 건너뛰고 항상 새 세션을 만든다.
# (이름은 gajae_code_ 접두사 유지 → gjc session / GC 가 계속 GJC 소유로 인식.)
# 더불어 상속된 TMUX/GJC_TMUX_LAUNCHED 마커도 제거해 세션 생성 건너뛰기를 방지.
gjc() {
  if [[ " $* " == *" --tmux "* ]]; then
    env -u TMUX -u GJC_TMUX_LAUNCHED -u TMUX_PANE \
      GJC_TMUX_SESSION="gajae_code_$(date +%s)_${RANDOM}_$$" \
      command gjc "$@"
  else
    command gjc "$@"
  fi
}

google-chrome() { open -a "Google Chrome" "$1" }
cursor() { open -a "/Applications/Cursor.app" "$@" }

# Node 서버 프로세스 정리
kill-node() {
  local candidates_text pid current ppid cmdline
  local -a candidates pids skipped survivors

  # 기본 예외: GJC/Codex/Claude/OMX/tmux 런타임이 쓰는 node 프로세스는 보존
  # 자식 프로세스(MCP 서버 등)도 부모 체인에 이 키워드가 있으면 같이 보존한다.
  # 필요하면 호출 전에 KILL_NODE_EXCLUDE_PATTERN으로 덮어쓸 수 있음.
  local exclude_pattern="${KILL_NODE_EXCLUDE_PATTERN:-}"
  if [[ -z "$exclude_pattern" ]]; then
    exclude_pattern='(^|[ /._-])(gjc|gajae-code|gajae|omx|oh-my-codex|claude-code|claude|codex|tmux)([ /._-]|$)'
  fi

  _kill_node_is_protected() {
    local current="$1" ppid cmdline

    while [[ -n "$current" && "$current" != "0" && "$current" != "1" ]]; do
      cmdline=$(ps -p "$current" -o command= 2>/dev/null)
      [[ -z "$cmdline" ]] && return 1

      if [[ "$cmdline" =~ "$exclude_pattern" ]]; then
        return 0
      fi

      ppid=$(ps -p "$current" -o ppid= 2>/dev/null | tr -d ' ')
      [[ -z "$ppid" || "$ppid" == "$current" ]] && return 1
      current="$ppid"
    done

    return 1
  }

  candidates_text=$( {
    # TCP 포트를 LISTEN 중인 node/bun 프로세스만 선택 (-a 없으면 모든 LISTEN 프로세스가 섞임)
    lsof -tiTCP -sTCP:LISTEN -a -c node 2>/dev/null
    lsof -tiTCP -sTCP:LISTEN -a -c bun 2>/dev/null
    # 자주 쓰는 Node 개발 서버/워처 명령
    # 경로에 들어간 /dev 같은 문자열이 오탐되지 않도록 실제 명령 인자 형태만 매칭한다.
    pgrep -f '(^|[ /])(npm|pnpm|yarn|bun)([ /]+run)?[ /]+(dev|serve|start|preview|watch)([ /]|$)' 2>/dev/null
  } | sort -u )

  candidates=("${(@f)candidates_text}")

  for pid in "${candidates[@]}"; do
    [[ -z "$pid" || "$pid" == "$$" ]] && continue
    cmdline=$(ps -p "$pid" -o command= 2>/dev/null)
    [[ -z "$cmdline" ]] && continue

    if _kill_node_is_protected "$pid"; then
      skipped+=("$pid")
    else
      pids+=("$pid")
    fi
  done

  unfunction _kill_node_is_protected 2>/dev/null

  if (( ${#skipped[@]} > 0 )); then
    echo "Skipping protected node processes: ${skipped[*]}"
  fi

  if (( ${#pids[@]} == 0 )); then
    echo "No killable node server processes found."
    return 0
  fi

  echo "Killing node server processes: ${pids[*]}"
  kill "${pids[@]}" 2>/dev/null
  sleep 1

  for pid in "${pids[@]}"; do
    kill -0 "$pid" 2>/dev/null && survivors+=("$pid")
  done

  if (( ${#survivors[@]} > 0 )); then
    echo "Force killing: ${survivors[*]}"
    kill -9 "${survivors[@]}" 2>/dev/null
  fi
}
# Bun 서버 프로세스 정리
# kill-node 와 동일한 안전장치를 쓰되 bun 프로세스만 대상으로 한다.
# 주의: gjc(gajae-code) 런타임 자체가 bun 으로 돌기 때문에, 부모 체인에
# 보호 키워드(gjc/gajae/omx/claude/codex/tmux)가 있으면 반드시 보존한다.
kill-bun() {
  local candidates_text pid current ppid cmdline
  local -a candidates pids skipped survivors

  # 기본 예외: GJC/Codex/Claude/OMX/tmux 런타임이 쓰는 bun 프로세스는 보존.
  # 자식 프로세스(MCP 서버 등)도 부모 체인에 이 키워드가 있으면 같이 보존한다.
  # 필요하면 호출 전에 KILL_BUN_EXCLUDE_PATTERN으로 덮어쓸 수 있음.
  local exclude_pattern="${KILL_BUN_EXCLUDE_PATTERN:-}"
  if [[ -z "$exclude_pattern" ]]; then
    exclude_pattern='(^|[ /._-])(gjc|gajae-code|gajae|omx|oh-my-codex|claude-code|claude|codex|tmux)([ /._-]|$)'
  fi

  _kill_bun_is_protected() {
    local current="$1" ppid cmdline

    while [[ -n "$current" && "$current" != "0" && "$current" != "1" ]]; do
      cmdline=$(ps -p "$current" -o command= 2>/dev/null)
      [[ -z "$cmdline" ]] && return 1

      if [[ "$cmdline" =~ "$exclude_pattern" ]]; then
        return 0
      fi

      ppid=$(ps -p "$current" -o ppid= 2>/dev/null | tr -d ' ')
      [[ -z "$ppid" || "$ppid" == "$current" ]] && return 1
      current="$ppid"
    done

    return 1
  }

  candidates_text=$( {
    # TCP 포트를 LISTEN 중인 bun 프로세스
    lsof -tiTCP -sTCP:LISTEN -a -c bun 2>/dev/null
    # 자주 쓰는 bun 개발 서버/워처 명령
    pgrep -f '(^|[ /])bun([ /]+run)?[ /]+(dev|serve|start|preview|watch)([ /]|$)' 2>/dev/null
  } | sort -u )

  candidates=("${(@f)candidates_text}")

  for pid in "${candidates[@]}"; do
    [[ -z "$pid" || "$pid" == "$$" ]] && continue
    cmdline=$(ps -p "$pid" -o command= 2>/dev/null)
    [[ -z "$cmdline" ]] && continue

    if _kill_bun_is_protected "$pid"; then
      skipped+=("$pid")
    else
      pids+=("$pid")
    fi
  done

  unfunction _kill_bun_is_protected 2>/dev/null

  if (( ${#skipped[@]} > 0 )); then
    echo "Skipping protected bun processes: ${skipped[*]}"
  fi

  if (( ${#pids[@]} == 0 )); then
    echo "No killable bun server processes found."
    return 0
  fi

  echo "Killing bun server processes: ${pids[*]}"
  kill "${pids[@]}" 2>/dev/null
  sleep 1

  for pid in "${pids[@]}"; do
    kill -0 "$pid" 2>/dev/null && survivors+=("$pid")
  done

  if (( ${#survivors[@]} > 0 )); then
    echo "Force killing: ${survivors[*]}"
    kill -9 "${survivors[@]}" 2>/dev/null
  fi
}
