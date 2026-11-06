# 로컬·Vercel 동기화 확인 · 2026-11-06

최초 확인 시각: 2026-11-06 11:12 KST

## 확인 결과

| 확인 대상 | 관측값 |
| --- | --- |
| 실험실 저장소 `main` | `d9a73b31b2fb923ab8299809b969dfcaf2b2c76b` |
| GitHub `origin/main` | 로컬 `main`과 같은 SHA |
| 로컬 `http://127.0.0.1:3000/api/state` | 인증 성공, 평가셋 118개·실행 2,203개, `live-qwen-http-sse-20261106` artifact 포함 |
| Vercel `https://knot-search-eval.vercel.app/api/state` | 인증 성공, 평가셋 35개·실행 434개, 위 artifact ID 없음 |
| GitHub commit status/deployment records | 이 SHA에 연결된 check run과 deployment record가 조회되지 않음 |

로컬 평가 DB와 Vercel DB는 별도 저장소이므로 개수 차이만으로 오류라고 볼 수 없다. 설계상 Vercel은 합성 자료 artifact만 읽기 전용으로 합치고, 로컬 DB의 실행·사람 검수 이력을 통째로 복사하지 않는다. 현재 확실한 불일치는 **최신 커밋에 포함된 artifact가 현재 Vercel API 응답에 나타나지 않는 점**이다.

저장소의 현재 코드에는 `lib/db.ts`의 `readState()`가 `mergePublishedExperiments()`를 호출하고, `lib/published-experiments.ts`가 커밋된 JSON을 view에 합치는 구현이 있다. 따라서 Vercel 응답에 artifact가 없다는 관측은 현재 production 함수가 이 커밋 코드를 실행하지 않거나 다른 소스/빌드 설정을 사용한다는 뜻이다. 실제 production commit SHA는 공개 응답으로 확인할 수 없어, 어느 쪽인지는 아직 확정하지 않았다.

## 최초 확인 당시 다음 단계

1. Vercel 프로젝트의 Git 연결 저장소·production branch·최신 production deployment commit을 대시보드에서 대조한다.
2. 해당 deployment가 `3d18d80b4fdd5043f3de7c1bd07c935325c6d0db` 이후 커밋인지 확인하고, 필요하면 Vercel에서 해당 `main`을 재배포한다.
3. 재배포 뒤 인증된 `/api/state`에서 `live-qwen-http-sse-20261106` 및 세 Qwen 관측 run을 확인한다.
4. 새 실험 결과도 같은 방식으로 합성 artifact에 기록하고 commit/push한 뒤 Vercel API에서 나타나는지 확인한다.

최초 확인 당시 Vercel 프로젝트에는 Git 저장소가 연결되지 않아 새 push가 자동 배포를 만들지 않았다. 실제 배포 SHA를 확인하기 전까지 로컬·Vercel 코드 버전이 일치한다고 보고하지 않는다.

## 후속 조치 · 2026-11-06 11:33 KST

사용자 요청에 따라 비밀값·토큰 패턴과 Git 이력을 검사한 뒤 `knot-service/knot-search-eval`을 공개 저장소로 전환했다. 공개된 평가 파일은 `source=synthetic`인 합성 자료였고, 점검한 커밋 이력에서 API 키, 액세스 토큰, 이메일 또는 개인 키 패턴은 발견되지 않았다. 테스트 질문의 전화번호 형태 값 3건은 플레이스홀더였다.

Vercel 프로젝트 설정에서 `knot-service/knot-search-eval` Git 연결이 완료된 것을 확인했다. 이 시점의 마지막 production 배포는 `e3b30ce` (`2026-11-03 09:57 KST`)이며, `d9a73b3` 이후 production 배포는 아직 보이지 않는다. 따라서 공개 저장소와 Vercel 연결은 완료됐지만, 최신 코드와 artifact의 배포·노출 검증은 남아 있다.

다음 문서 업데이트를 `main`에 push해 Git 연동 배포를 발생시키고, 배포 SHA·상태를 확인한 뒤 인증된 `/api/state`에서 `live-qwen-http-sse-20261106`와 3개 관측 실행이 보이는지 다시 확인한다. 그 확인 전에는 Vercel이 최신 로컬 코드·artifact와 동기화됐다고 간주하지 않는다.

## 후속 조치 · 2026-11-06 11:57 KST

저장소를 공개로 전환하고 Vercel Git 연결 뒤 `85166cf` (`docs: record public repo and Vercel connection`) production 배포가 **Ready**인 것을 확인했다. 배포된 `/api/state`는 인증 없이 `401`을 반환했다. 기존 관리자 로그인을 사용해 읽기 전용 확인을 진행했다.

업로드 전 로컬 전체 상태를 검사했다. 118개 평가셋은 모두 `source=synthetic`이고, 2,203개 실행 중 `production` 환경 표시는 0개였다. credential·JWT·개인 키·이메일 패턴은 0건이었다. 전화번호 형태 문자열 102회는 질문 필드의 단일 all-zero 테스트 placeholder로 확인했다. 이 로컬 결과를 원격 Git 파일로 공개하지 않고, 로그인 보호된 Vercel 평가 DB에만 병합했다.

Neon DB의 기존 상태가 인증된 Vercel API 응답에서 읽기 전용 Qwen artifact 1개 평가셋과 실행 3건을 뺀 값과 정확히 일치하는지 확인한 뒤, 한 트랜잭션으로 중복 없는 항목만 추가했다. 기존 항목과 충돌은 없었다.

| 확인 대상 | 동기화 후 관측값 |
| --- | --- |
| 로컬 `http://127.0.0.1:3000/api/state` | 평가셋 118개 · 실행 2,203개 · 검수 9,859개 |
| Vercel Neon 저장 상태 | 평가셋 117개 · 실행 2,200개 · 검수 9,859개 |
| Vercel 인증 API view | 평가셋 118개 · 실행 2,203개 · 검수 9,859개 |
| 공개 read-only artifact overlay | 평가셋 1개 · 실행 3개, Neon 중복 저장 없음 |
| 이번에 추가한 항목 | 평가셋 82개 · 실행 1,766개 · 검수 1,718개 |

동기화 후 Neon에 저장된 모든 로컬 평가셋·실행·검수 ID와 내용을 다시 확인했고, 인증된 Vercel API에서도 2,203개 실행과 9,859개 검수 기록이 로컬과 일치하는 것을 확인했다. 로컬 DB는 계속 원본 전체를 보존한다.

기존 데이터의 두 스키마 호환성도 확인했다. 4개 과거 실행은 현재 `RunSchema`의 `strategy` 100자 제한만 초과하지만 나머지 필드는 유효해 원문 그대로 보존했다. 또 51개 평가셋은 PostgreSQL JSONB에서 읽은 뒤 기존 `contentHash`를 다시 계산하면 값이 다르지만, Zod 재파싱에서 필드 손실은 없었다. 이관 과정에서는 기존 hash를 재작성하지 않았다. 이 hash의 직렬화 순서 의존성과 `strategy` 길이 제한은 후속 정리 항목이다.

이번 동기화는 한 번의 병합이다. 자동 동기화는 아직 없으므로 이후 생성된 로컬 데이터는 다시 반영해야 한다. 공개 저장소에는 전체 DB dump를 추가하지 않는다.

## 데이터 범위

- 공개 artifact에는 합성 회의 문서에서 실행한 선택된 Qwen HTTP/SSE 관측이 포함된다. Vercel에서는 읽기 전용으로 합쳐진다.
- 그 artifact의 3개 실행은 Vercel Neon에 별도로 저장하지 않는다. 인증된 API view에서만 보인다.
- 나머지 로컬 합성 평가셋·실행·검수는 2026-11-06에 인증된 Vercel Neon으로 한 번 병합했고, 로컬 DB에도 모두 유지한다.
- GitHub에는 전체 로컬 DB를 올리지 않았다. 앞으로 새 결과가 자동 동기화되지는 않는다.
