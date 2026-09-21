---
name: subagent
description: subagent(task·team·workflow) 위임 규칙입니다. 자식 모델은 opencodex/bai/deepseek-v4.1-flash 로 고정되어 있고, 호출자가 model 인자로 그 핀을 덮지 못하게 하는 것이 이 규칙의 핵심입니다.
alwaysApply: true
---

# subagent 위임 규칙

## 모델 고정 (가장 중요)

- subagent(자식)의 모델은 `opencodex/bai/deepseek-v4.1-flash` 하나로 고정되어 있습니다. `~/.omo/omo.jsonc`의 `categories.*`·`agents.*` 핀이 그 역할을 합니다.
- 자식에게 **`model` 인자를 직접 넘기지 않습니다.** `task`, `workflow` 노드, `team` 멤버, `eval`의 `agent(prompt, {model})` 어디에도 넣지 않습니다. 명시적 `model`은 위 핀을 이기고, 그 순간 "제멋대로 모델 고르기" 문제가 되살아납니다.
- 카테고리를 새로 만들거나 핀 모델을 바꿔야 하면 먼저 사용자에게 확인합니다. 핀을 지우면 자식이 내장 체인의 임의 모델로 떨어집니다.
- `ultrabrain`·`architect`는 `disable: true`로 막혀 있습니다. 호출하면 `category_disabled` 오류가 나며 이건 정상 동작입니다. 우회하려 들지 말고 다른 카테고리로 처리하거나 사용자에게 알립니다.
- 자식은 세션(부모) 모델을 상속하지 않습니다. "부모가 쓰는 모델이니 자식도 그럴 것"이라고 가정하지 않습니다.

## 위임 사용

- 위임은 허용됩니다(2026-09-21 차단 해제). 조사, 구현, 검증을 자식에게 맡겨도 됩니다.
- 독립적인 작업은 병렬로 던집니다. 의존 관계가 있으면 `workflow`(DAG)나 `task` 배치를 씁니다.
- 자식은 손자를 만들지 않습니다(`task.max_depth` 기본 1). 깊은 트리를 기대하지 않습니다.
- 자식 세션에서는 `task`·`team_*`·`workpool` 도구가 제거됩니다(재귀 차단).

## 검증

- 자식이 실제로 어떤 모델로 돌았는지는 `~/.omo/agent/.omo/senpi-task/tasks/st_*.json`의 `model`, `requested_model.source`, `resolved_model`로 확인합니다.
- `requested_model.source`가 `category`나 `agent`면 핀이 적용된 것이고, `explicit`이면 누군가 `model` 인자를 넘긴 것입니다. 후자를 발견하면 그 호출부를 고칩니다.

## 다른 규칙과의 관계

- Paseo 세션에서 `paseo-orchestration.md`가 정한 방식(터미널 탭에서 별도 omo 프로세스로 하위 작업 실행)은 subagent가 아니므로 이 모델 고정의 대상이 아닙니다. 그 규칙을 그대로 따릅니다.
- 메모리 reflection처럼 omo 엔진이 직접 띄우는 백그라운드 작업은 `reflection` 카테고리를 쓰며 같은 핀을 따릅니다.
