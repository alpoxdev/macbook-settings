---
name: codegraph
description: 코드 구조·호출 흐름·영향 범위를 볼 때 CodeGraph를 먼저 쓰도록 합니다. 인덱스가 있는 프로젝트에서만 적용합니다.
alwaysApply: true
---

# CodeGraph

코드베이스 구조, 호출 흐름, 심볼 위치, 변경 영향 범위를 볼 때는 파일 검색보다 CodeGraph를 먼저 씁니다.

- 도구: `codegraph_explore` (MCP 서버 `codegraph`)
- 한 번 호출로 관련 소스, 호출 경로, 영향 범위를 받습니다. 인덱스가 있는 코드는 grep/Read로 다시 훑지 않습니다.
- 프로젝트에 `.codegraph/`가 없으면 CodeGraph를 호출하지 말고 기존 도구를 씁니다. 인덱스는 사용자가 `codegraph init`으로 만듭니다.
- 응답에 오래된 파일 경고가 있으면 그 파일만 직접 읽습니다.
