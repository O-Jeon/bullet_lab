# BULLET LAB v0.4 업데이트

## 난이도 정책

- 튜토리얼/입문 연습(15개): **최단 2~5회**인 문제가 등장하고, 최단 풀이 힌트를 볼 수 있습니다.
- 시간제한 없는 자유 연습(6+) · 실전 2분 챌린지 · 모든 온라인 대전: **최단 6회 이상**이 검증된 문제만 등장합니다.
- 실전 문제 120개는 **목표가 아닌 다른 로봇을 적어도 한 번 움직여야** 해결할 수 있습니다.
- 각 실전 문제에는 **20회 이하의 실제 성공 경로**가 포함되어 있습니다. 경로의 길이가 곧 최단 이동 횟수라는 뜻은 아닙니다.
- 6회 이상 퍼즐은 한 번의 시도당 최대 20회까지 움직일 수 있고, 그 전에 다시 시작할 수 있습니다.
- 두 문제 은행은 코드에 저장된 검증 문제 목록입니다. 임의 배치·임의 목표만으로 난이도가 보장된다고 주장하지 않습니다.

## 게임 및 대전

- 20×20 게임판, 5개 로봇, 새 고정 내부 벽
- 선착순: 서버가 첫 정답을 검증하면 즉시 종료
- 2분 최단 횟수: 여러 번 답안을 제출할 수 있고 가장 적은 유효 이동 횟수로 순위 결정. 동률은 유효 최고 기록을 먼저 제출한 순서
- 친구 방은 방장이 모드를 선택하고 QR로 최대 8명 초대
- 랜덤 매칭은 **인원(2·3·4명)과 규칙(선착순/최단 횟수)이 모두 같은 사람끼리** 매칭
- 각 라운드 종료 후 결과 팝업에서 재대결 요청/나가기 선택

## Windows CMD에서 업데이트 적용

먼저 프로젝트 폴더의 변경 사항이 중요하다면 백업하세요. ZIP을 프로젝트 루트에 덮어씁니다.

```cmd
cd /d F:\bullet-man-multiplayer\bullet-man
powershell -NoProfile -Command "Expand-Archive -LiteralPath 'F:\bullet-lab-v0.4-update.zip' -DestinationPath 'F:\bullet-man-multiplayer\bullet-man' -Force"
npm install
npm test
npm run build
```

테스트와 빌드가 모두 성공하면 다음 명령어로 GitHub에 올립니다. 다른 곳에서 수정한 새 커밋이 있다면 먼저 `git pull --no-rebase origin main`으로 병합해야 합니다.

```cmd
git add .
git commit -m "feat: certified difficulty and two multiplayer rules"
git pull --no-rebase origin main
git push origin main
```

Render에 GitHub 자동 배포가 연결되어 있으면 main 브랜치를 올린 뒤 배포가 시작됩니다.

> 서버는 여전히 메모리 기반입니다. 무료 Render 서버가 잠들거나 재시작하면 대기 중인 방은 사라질 수 있습니다. 실제 접속을 여러 기기에서 재검증하세요.
