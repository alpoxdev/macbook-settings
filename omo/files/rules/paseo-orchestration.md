---
name: paseo-orchestration
description: Paseo 세션에서 에이전트 오케스트레이션을 수행할 때의 실행 규칙입니다.
alwaysApply: true
---

# Paseo 오케스트레이션 규칙

현재 세션이 Paseo에서 실행 중이고 에이전트 오케스트레이션이 필요하면 `paseo` 오케스트레이션 스킬을 사용합니다.

- 새 탭이나 새 브랜치에서 작업을 분리할 때는 Paseo의 에이전트 탭이 아니라 터미널 탭을 엽니다.
- 새 브랜치가 필요하면 먼저 Paseo 워크스페이스를 만들고, 그 워크스페이스에 터미널 탭을 엽니다.
- 터미널 탭에서 하위 작업을 OMO로 실행합니다. Paseo의 `create_agent`나 `paseo run`으로 에이전트 탭을 만들지 않습니다.
- 실행 명령에는 `omo --model`을 사용하고, 현재 세션과 같은 모델 및 effort(추론 강도)는 `--thinking`으로 지정합니다.
- 현재 세션의 모델이나 effort를 확인할 수 없으면 추측해서 실행하지 말고, 확인 가능한 정보를 먼저 사용합니다.

## 터미널 탭에서 OMO 실행

현재 모델과 effort를 확인한 뒤, 새 터미널 탭에서 아래 형식으로 실행합니다.

```bash
omo --model "<현재 세션 모델>" --thinking "<현재 세션 effort>" "<하위 작업 지시>"
```

새 브랜치 워크스페이스에 터미널 탭을 만들 때는 아래 형식을 사용합니다.

```bash
paseo workspace create --isolation worktree --mode branch-off --new-branch "<브랜치 이름>" --base "<기준 브랜치>"
paseo terminal create --workspace "<새 워크스페이스 ID>" --name "<작업 이름>"
```

## Paseo 세션 확인

Paseo가 주입한 `PASEO_WORKSPACE_ID`와 `PASEO_TERMINAL_ID`가 모두 있으면 현재 세션을 Paseo 세션으로 판단합니다.

```bash
#!/usr/bin/env bash
set -euo pipefail

if [[ -n "${PASEO_WORKSPACE_ID:-}" && -n "${PASEO_TERMINAL_ID:-}" ]]; then
  printf 'Paseo session\n'
  exit 0
fi

printf 'Not a Paseo session\n' >&2
exit 1
```

예를 들어, 오케스트레이션 전에는 아래처럼 확인합니다.

```bash
if [[ -n "${PASEO_WORKSPACE_ID:-}" && -n "${PASEO_TERMINAL_ID:-}" ]]; then
  # `paseo` 스킬로 OMO 하위 에이전트를 현재 세션과 같은 모델 및 effort로 실행한다.
  printf 'Use the paseo orchestration skill.\n'
fi
```
