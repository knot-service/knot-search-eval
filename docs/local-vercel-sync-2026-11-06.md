# 로컬·Vercel 동기화 확인 · 2026-11-06

확인 시각: 2026-11-06 11:12 KST

## 확인 결과

| 확인 대상 | 관측값 |
| --- | --- |
| 실험실 저장소 `main` | `3d18d80b4fdd5043f3de7c1bd07c935325c6d0db` |
| GitHub `origin/main` | 로컬 `main`과 같은 SHA |
| 로컬 `http://127.0.0.1:3000/api/state` | 인증 성공, 평가셋 118개·실행 2,203개, `live-qwen-http-sse-20261106` artifact 포함 |
| Vercel `https://knot-search-eval.vercel.app/api/state` | 인증 성공, 평가셋 35개·실행 434개, 위 artifact ID 없음 |
| GitHub commit status/deployment records | 이 SHA에 연결된 check run과 deployment record가 조회되지 않음 |

로컬 평가 DB와 Vercel DB는 별도 저장소이므로 개수 차이만으로 오류라고 볼 수 없다. 설계상 Vercel은 합성 자료 artifact만 읽기 전용으로 합치고, 로컬 DB의 실행·사람 검수 이력을 통째로 복사하지 않는다. 현재 확실한 불일치는 **최신 커밋에 포함된 artifact가 현재 Vercel API 응답에 나타나지 않는 점**이다.

저장소의 현재 코드에는 `lib/db.ts`의 `readState()`가 `mergePublishedExperiments()`를 호출하고, `lib/published-experiments.ts`가 커밋된 JSON을 view에 합치는 구현이 있다. 따라서 Vercel 응답에 artifact가 없다는 관측은 현재 production 함수가 이 커밋 코드를 실행하지 않거나 다른 소스/빌드 설정을 사용한다는 뜻이다. 실제 production commit SHA는 공개 응답으로 확인할 수 없어, 어느 쪽인지는 아직 확정하지 않았다.

## 다음 확인

1. Vercel 프로젝트의 Git 연결 저장소·production branch·최신 production deployment commit을 대시보드에서 대조한다.
2. 해당 deployment가 `3d18d80b4fdd5043f3de7c1bd07c935325c6d0db` 이후 커밋인지 확인하고, 필요하면 Vercel에서 해당 `main`을 재배포한다.
3. 재배포 뒤 인증된 `/api/state`에서 `live-qwen-http-sse-20261106` 및 세 Qwen 관측 run을 확인한다.
4. 새 실험 결과도 같은 방식으로 합성 artifact에 기록하고 commit/push한 뒤 Vercel API에서 나타나는지 확인한다.

이 점검 시점에는 Vercel CLI 로그인이나 Vercel 배포 관리 연결을 사용할 수 없어 deployment를 직접 재실행하지 않았다. Git push는 성공했지만, push만으로 Vercel production 배포가 완료됐다고 간주하지 않는다. 실제 배포 SHA를 확인하기 전까지 로컬·Vercel 코드 버전이 일치한다고 보고하지 않는다.

## 데이터 범위

- 공개 artifact에는 합성 회의 문서에서 실행한 선택된 Qwen HTTP/SSE 관측과 품질 기록만 포함한다.
- artifact는 Vercel에서 읽기 전용이며 Vercel DB에는 복사하지 않는다.
- 로컬 `knot_eval`의 모든 기존 실행과 사람 검수 이력은 계속 로컬에 보존한다.
- 로컬 평가 DB 전체를 Git이나 Vercel로 자동 업로드하지 않는다.
