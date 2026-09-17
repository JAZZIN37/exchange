# GitHub Actions → Vercel 배포 안내

이 앱은 정적 HTML만으로 동작하지 않는다. DeepL API 키를 브라우저에 노출하지 않기 위해 Flask 서버가 `/api/translate`를 제공한다.

## GitHub Push로 Vercel 배포(권장)

저장소 루트의 `vercel.json`과 `api/index.py`가 Flask 앱을 Vercel Python Function으로 연결한다.

`main` 브랜치 Push 뒤 GitHub Actions가 테스트를 통과한 경우 Vercel 프로덕션 배포를 수행하도록 `.github/workflows/deploy-vercel.yml`을 추가했다.

최초 1회에만 Vercel 프로젝트를 만들고 GitHub 저장소의 Actions secrets를 설정한다. 실제 비밀값은 GitHub 저장소 파일·대화·브라우저 코드에 넣지 않는다.

1. Vercel에서 GitHub 저장소 `JAZZIN37/exchange`를 Import한다. Framework Preset은 Other로 두고, `vercel.json`을 그대로 사용한다.
2. Vercel Project Settings → Environment Variables에 다음을 등록한다.

```bash
DEEPL_API_KEY=<DeepL에서 발급한 실제 키>
DEEPL_API_BASE_URL=https://api-free.deepl.com
ALLOWED_ORIGINS=
```

3. Vercel → Account Settings → Tokens에서 배포 토큰을 만들고, GitHub 저장소 Settings → Secrets and variables → Actions에 다음 세 가지 secret을 등록한다.

```text
VERCEL_TOKEN=<Vercel 배포 토큰>
VERCEL_ORG_ID=<Vercel 조직 또는 개인 계정 ID>
VERCEL_PROJECT_ID=<Vercel 프로젝트 ID>
```

`VERCEL_ORG_ID`와 `VERCEL_PROJECT_ID`는 Vercel 프로젝트를 `vercel link`한 뒤 생성되는 `.vercel/project.json`에서 확인할 수 있으며, 이 파일과 토큰은 GitHub에 커밋하지 않는다.

이후 `main`으로 Push하면 `CI`와 `Deploy to Vercel` workflow가 실행된다. 배포 workflow는 테스트 실패 시 중단되며, 위 세 secret이 등록되기 전에는 배포 job을 안전하게 건너뛴다.

`DEEPL_API_KEY`는 채팅, GitHub 파일, 브라우저 코드에 넣지 않는다. Vercel 환경변수에 직접 입력한다. Pro 계정이면 `DEEPL_API_BASE_URL`을 `https://api.deepl.com`으로 바꾼다.

## 테스트 주소

Vercel CLI의 임시 배포 주소는 GitHub Actions와 독립적으로 생성할 수 있다. 임시 주소에서는 화면과 게시판 대상 URL을 확인할 수 있지만, DeepL 환경변수가 없으면 실제 번역은 동작하지 않는다.

```bash
npx vercel deploy --temporary --yes
```

## 배포 URL 확인

```text
https://<프로젝트>.vercel.app/
https://<프로젝트>.vercel.app/api/health
```

`/api/health`가 HTTP 200이고 `deepl_configured: true`를 반환하면 서버 환경변수가 준비된 상태다. 키 값 자체는 응답에 포함되지 않는다.

배포 workflow가 끝난 뒤 Vercel의 Production Deployment 로그와 위 두 URL을 모두 확인한다. `/api/health`가 HTTP 200이고 `deepl_configured: true`를 반환하면 서버 환경변수까지 준비된 상태다.

## Render 대체 배포

Vercel 인증 또는 Python Function 사용이 어려운 경우에는 기존 `render.yaml`을 이용해 Render Web Service로 배포할 수 있다.

## 배포 순서

1. 프로젝트 폴더를 GitHub 저장소에 Push한다.
2. Render에서 **New > Blueprint**를 선택하고 저장소를 연결한다.
3. `render.yaml`을 적용한다.
4. Render 환경변수에 다음 값을 등록한다.

```text
DEEPL_API_KEY=<DeepL에서 발급한 실제 키>
DEEPL_API_BASE_URL=https://api-free.deepl.com
ALLOWED_ORIGINS=
```

DeepL Pro 계정이면 `DEEPL_API_BASE_URL`을 `https://api.deepl.com`으로 바꾼다.

5. 배포 후 다음 주소가 모두 정상인지 확인한다.

```text
https://<서비스주소>.onrender.com/api/health
https://<서비스주소>.onrender.com/
```

`/api/health` 응답에 `deepl_configured: true`가 표시되어야 한다. API 키 자체는 응답에 포함되지 않는다.

## GitHub Actions

`.github/workflows/ci.yml`은 Push와 Pull Request마다 다음을 검사한다.

- DeepL 키 없이 목업 번역 테스트
- Python 컴파일
- 확장 프로그램 JavaScript 문법
- 두 manifest JSON
- 소스에 실제 DeepL 키가 들어갔는지 여부

`.github/workflows/deploy-vercel.yml`은 main Push 및 수동 실행에서 같은 테스트를 다시 수행한 뒤, Vercel Actions secrets가 등록된 경우에만 프로덕션으로 배포한다.

## 보안 주의

- 실제 키를 GitHub 파일, README, `.env.example`, 브라우저 코드에 넣지 않는다.
- Render의 Environment Variables에만 실제 키를 저장한다.
- 키가 커밋되었다면 즉시 DeepL 콘솔에서 폐기·재발급하고 GitHub 기록에서도 제거한다.
- GitHub Pages를 별도 프런트엔드로 사용할 때만 `ALLOWED_ORIGINS`에 정확한 Pages 주소를 등록한다.
