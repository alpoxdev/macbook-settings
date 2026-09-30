---
name: cua-jev-computer-use
description: GUI 컴퓨터 사용 자동화 규칙 — cua-driver(관찰·조작) + Jev(b.ai Decisions API, bounded 선택). 화면 조작·앱 자동화·스크린샷·클릭/타이핑 요청에 적용한다.
alwaysApply: true
---

# cua-driver + Jev 컴퓨터 사용 규칙

로컬 macOS GUI를 실제로 조작해야 할 때, **orca computer 대신 cua-driver**를 쓰고, "다음에 무엇을 할지"를 고르는 판단은 **Jev(b.ai Decisions API)** 로 한다.

## Intent

- GUI 작업을 코드로 수행한다: 앱/창 상태를 읽고(get_window_state), 요소를 클릭·타이핑하고, 결과를 다시 관찰해 검증한다.
- Jev 는 **bounded chooser** 다: 자유 조작이 아니라 내가 정의한 후보 중 하나를 고르게 한다.

## Trigger

- 트리거: "이 앱 조작해줘", 클릭·입력·스크린샷·창 상태·자동화 요청, 또는 실제 GUI 동작이 필요한 작업.
- 우선순위 예외: **로그인이 필요한 웹사이트 조작은 aside-browser** 를 먼저 쓴다(브라우저 자동화 규칙이 우선). cua-driver 는 네이티브 앱·실 데스크톱 조작에 쓴다.

## Scope / 소유

- 소유: 이 맥의 GUI 조작(cua-driver), 선택 판단(Jev), 조작 증거(스크린샷·AX 트리).
- 소유하지 않음: 사용자 승인 없이 파괴적 동작(파일 삭제·결제·메시지 전송) 수행. 그건 확인 후.

## Authority

- 사용자 지시가 최상위. 이 규칙은 도구·절차를 지정할 뿐 허가를 주지 않는다.
- 되돌리기 어려운 동작(삭제·전송·결제)은 실행 전에 확인한다.

## Capabilities

설치·경로 (이 맥 기준, 검증됨 2026-09-30):
- 바이너리: `~/.local/bin/cua-driver` (CuaDriver.app 번들 0.30.4+). 데몬은 `cua-driver status`, 권한은 `cua-driver call check_permissions`.
- 권한: 데몬이 **자기 신원**으로 읽으므로 데몬을 띄운 뒤 확인한다. 갱신 후에는 **데몬 재시작**(`cua-driver stop && open -n -g -a CuaDriver --args serve`)이 필요하다.
- jev-use 예제: `~/Desktop/dev/alpox/cua/libs/cua-driver/examples/jev-use` (uv 로 실행).

관찰 도구:
- `cua-driver call list_apps` — 실행/설치 앱 목록
- `cua-driver call get_accessibility_tree` — 창 목록(`windows[].window_id`, pid)
- `cua-driver call get_window_state '{"pid":P,"window_id":W}'` — 해당 창의 AX 요소배열 + 스크린샷. **행동 전 이 호출로 요소를 인덱싱**한다.
- `cua-driver call get_desktop_state` / `get_cursor_position`

조작 도구(요소 인덱스 또는 좌표): `click`, `type_text`, `press_key`, `drag`, `bring_to_front`, 브라우저용 `browser_*`.

Jev (bounded 선택) — **b.ai 를 통해**:
- 엔드포인트: `POST https://api.b.ai/v1/decisions` · 헤더 `Authorization: Bearer $BAI_API_KEY` (opencodex 에 등록된 b.ai 키 사용, 별도 TypeSafe 계정 불필요)
- 모델: `jev-latest` (또는 `jev-1.13.0`)
- 요청: `{"model":"jev-latest","state":<관찰>,"questions":{"<id>":{"type":"choice|noul|score","instructions":...,"criteria":{...}}}}`
  - `choice`: criteria 는 **객체**(라벨 맵) · `noul`: 예/아니오 확률 · `score`: 2~10 서열 배열
- 응답: `{"model":"jev-1.13.0","answers":{"<id>":{"choice":...,"confidence":...,"probabilities":{...}}}}`
- 예제 클라이언트: jev-use 의 `python/bai_decision_client.py` (BAI_API_KEY 설정 시 자동 사용)

## Verification

- **행동 → 재관찰 → 확인** 순서를 지킨다. 행동 뒤 반드시 `get_window_state` 로 결과를 다시 읽어 의도한 상태인지 본다.
- AX 트리와 스크린샷을 함께 본다(트리는 Electron 등에서 거짓일 수 있음 — 스크린샷으로 교차확인).
- 검증 못 한 항목은 '미검증(사유)' 로 남긴다.

## Stop

- 의도한 GUI 결과가 재관찰로 확인됐을 때. 또는 파괴적·외부 전송 동작의 확인 대기일 때.

## jevgrep (`jg`) — Jev 로 저장소 코드 찾기 (설치됨 2026-09-30)

- 무엇: 저장소에 "이 동작이 어디 있나" 질문을 던지면 관련 파일·선언·소스 발췌를 stdout 으로 돌려주는 CLI. 파일 이름을 모를 때 유용하다. 정확한 심볼·경로를 알면 `rg`·직접 읽기가 낫다.
- 설치: `bun add -g @dzhng/jevgrep` (Node 22+ 필요) → `~/.bun/bin/jg` (v0.7.0).
- 사용: `jg "<질문>" [루트]` · 파일 수만 보려면 `jg files [루트]`.
- <b>인증 상태: 미완</b> — 지원 공급자는 Vercel AI Gateway / TypeSafe / OpenRouter / OpenCode Zen / (custom TypeSafe 호환 엔드포인트). 이 맥에는 그 키가 없다.
  - b.ai 는 <b>jg 에 못 쓴다</b>: b.ai 프록시가 `/v1/chat/completions`·`/v1/messages`·`/v1/responses`·`/v1/decisions`·`/v1/models`·`/v1/images/*` 만 허용하는데, jg 의 custom 엔드포인트는 TypeSafe 의 `systemone` 경로를 호출해 403 이 난다(실측).
  - OpenCode Zen 키가 있어야 `jg auth --provider opencode --stdin` 이 동작한다(opencode-go 키는 402 insufficient funds 로 실패).
- 인증 명령(custom 예): `jg auth --provider custom --base-url URL --model ID --stdin`. 스킬 설치: `jg skill --global --yes`.
