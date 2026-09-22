# BULLET LAB — 0.3 선착순 대전 · 랜덤 매칭

React + TypeScript + Socket.IO 기반 총알탄 사나이 스타일의 16×16 퍼즐 웹게임. PC와 모바일 브라우저에서 플레이할 수 있다.

## 게임 모드

- **혼자 하기:** 시간 제한 없는 연습 / 2분 챌린지, 실행 취소, 힌트, 오늘의 퍼즐.
- **친구 대전:** 2~8명. 방장이 방을 만들고 6자리 코드/QR을 공유. 방장이 시작하면 3초 카운트다운 후 동일한 퍼즐에 도전.
- **랜덤 매칭:** 2·3·4인 중 인원 선택. 같은 인원을 선택한 실제 플레이어가 모이면 자동으로 동일한 퍼즐을 시작. 봇은 없으며 사람이 부족하면 대기한다. 검색 중 취소 가능.

## 대전 규칙과 재대결

1. 서버가 **첫 번째 유효한 정답 경로**를 검증하는 즉시 경기를 종료한다. 이동 횟수는 통계로 표시하며, 이번 버전의 승부는 최단 이동 횟수가 아닌 **선착순 정답**이다.
2. 첫 성공자를 1위로 표시한다. 게임이 즉시 끝나기 때문에 나머지 참가자에게는 확정 가능한 2위·3위가 없으며 **미완료**로 표시한다. 2분 안에 아무도 못 풀면 무승부.
3. 모든 참가자에게 결과 팝업이 표시된다. 각자 **재대결 요청** 또는 **그만하고 나가기**를 선택한다. 연결된 참가자 2명 이상이 전원 재대결을 요청하면 **새 퍼즐**로 3초 뒤 자동 시작한다. 다른 사람이 나갔다면 남은 인원에 맞춰 재대결을 진행한다(최소 2명).
4. 로봇 이동은 각자의 게임판에서 독립적으로 처리되며, 서버가 제출된 전체 이동 경로를 재실행해 검증한다. 문제 생성 시의 예시 정답 경로는 참가자에게 전송하지 않는다.

## Windows CMD에서 실행

Node.js 20 이상이 필요하다. 프로젝트 루트에서:

```cmd
cd /d F:\bullet-man-multiplayer\bullet-man
npm install
npm run dev
```

브라우저에서 `http://localhost:5173`을 연다. 같은 컴퓨터에서 일반 창 + 시크릿 창으로 친구 대전을 테스트할 수 있다. 스마트폰 QR 테스트에는 배포된 HTTPS 주소 또는 같은 Wi-Fi의 PC IP 주소가 필요하다. `localhost`로 생성된 QR은 다른 기기에서 작동하지 않는다.

## 로컬 테스트와 빌드

```cmd
npm test
npm run build
npm start
```

`npm start`는 빌드된 정적 사이트와 Socket.IO를 한 서버에서 제공한다. 기본 포트는 3001이며 Render에서는 `PORT` 환경변수를 따른다.

## 무료 배포 — Render Web Service

GitHub에 커밋/푸시한 뒤 연결된 Render Web Service에서 아래 값으로 배포한다. `render.yaml`을 통한 Blueprint 설정도 포함되어 있다.

| 항목 | 값 |
| --- | --- |
| Runtime | Node |
| Build Command | `npm install --include=dev --no-audit --no-fund && npm run build` |
| Start Command | `npm start` |
| Health Check Path | `/api/health` |
| Instance | 처음에는 Free 1개 |

**유의사항:** 방·랜덤 매칭 대기열·재대결 상태는 서버 메모리에만 저장된다. Render 무료 인스턴스가 유휴 상태로 잠들거나 재시작/재배포되면 초기화될 수 있다. 배포 시에는 단일 서버 인스턴스를 사용한다. 다중 인스턴스로 확장하려면 Redis 등의 공유 상태 저장소 및 Socket.IO 어댑터가 추가로 필요하다. 서버 무료 한도나 가격은 Render에서 배포 전에 확인한다.

## 폴더 구조

```text
src/engine.ts             이동 규칙과 랜덤 문제 생성
src/GameBoard.tsx          공통 게임판/조작 UI
src/SoloGame.tsx           연습 모드
src/OnlineGame.tsx         친구 방, QR, 랜덤 매칭, 결과 팝업
src/multiplayer.ts         클라이언트·서버 공통 프로토콜
server/rooms.ts            방/대기열/타이머/선착순 승리/재대결 판정
server/index.ts            HTTP + Socket.IO 서버
server/rooms.test.ts       게임 서버 단위 테스트
server/socket.test.ts      Socket.IO 통합 테스트
render.yaml                Render 설정
```

## 배포 전 확인할 사항

- 불특정 이용자 증가를 고려한 신고/차단/욕설 필터, 접근성, 이용 약관과 개인정보 안내 등은 별도로 준비한다. 현재는 닉네임만 사용하며 계정·영구 랭킹을 저장하지 않는다.
- 상용 배포 전에는 기존 게임의 이름·로고·그림·게임판 등 권리 문제를 검토하고 독자적인 브랜드와 그래픽을 사용한다.
