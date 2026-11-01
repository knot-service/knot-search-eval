# Knot 탐색 평가 어드민

Knot 탐색의 합성 시나리오와 수동으로 가져온 실험 결과를 검수·비교하는 개인용 도구입니다. 실제 회의 문서 및 운영 DB, 자동 평가 실행은 범위 밖입니다. 포함된 결과는 합성 예시이며 성능 측정값이 아닙니다.

## 실행

Node.js 22와 별도 PostgreSQL이 필요합니다. `.env.example`을 복사하여 `DATABASE_URL`, `ADMIN_PASSWORD`, 32자 이상의 독립 `SESSION_SECRET`을 설정합니다. 운영 DB는 연결하지 않습니다.

```sh
npm install
npm run dev
npm run test
npm run typecheck
npm run build
```

로그인 후 평가셋 화면에서 합성 예시를 추가하고 버전을 잠근 뒤 실험 화면에서 합성 결과를 추가하거나 JSON을 가져옵니다. JSON 예시는 `data/`를 참고하세요. 검수는 추가 이력으로 남습니다. 모든 데이터 API는 인증을 요구합니다. Vercel에서 PostgreSQL은 별도 영구 서비스가 필요하며 함수의 로컬 파일은 저장소가 아닙니다.

첫 릴리스는 개인용 비밀번호 인증입니다. 로그인 시도 횟수 제한을 두지만 다중 사용자 계정과 외부 노출 환경의 운영 보호는 추가 검증이 필요합니다. 실제 자료를 업로드하지 마세요.
