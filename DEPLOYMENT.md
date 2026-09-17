# GitHub Pages + Cloudflare Worker 배포 안내

## 배포 구조

이 앱은 두 개의 영구 서비스로 구성된다.

- 화면: GitHub Pages (`https://jazzin37.github.io/exchange/`)
- 번역·이미지 게시 API: Cloudflare Worker (DeepL API 키는 서버 secret, 게시 계정은 요청에만 사용)

GitHub Pages는 정적 HTML/CSS/JavaScript만 제공한다. 따라서 DeepL API 키를 GitHub Pages 코드에 넣으면 공개되어 사용할 수 없게 된다. 번역 요청은 GitHub Pages에서 Cloudflare Worker의 `/api/translate`로 보내고, Worker만 DeepL에 연결한다.

코드 변경은 `main` 브랜치 Push로 배포한다.

1. GitHub Actions가 Python/JavaScript/Worker 테스트를 실행한다.
2. `Deploy site to GitHub Pages`가 정적 화면을 영구 Pages URL로 배포한다.
3. `Deploy translation Worker`가 Cloudflare Worker 코드를 배포하고 DeepL 키를 Worker secret으로 갱신한다.

## 최초 1회 설정

### 1. GitHub Pages 활성화

GitHub 저장소 `JAZZIN37/exchange`에서 다음을 설정한다.

1. Settings → Pages
2. Build and deployment → Source에서 `GitHub Actions` 선택
3. `main`에 Push하거나 Actions 탭에서 `Deploy site to GitHub Pages` workflow를 실행

완료 후 기본 영구 주소는 다음이다.

```text
https://jazzin37.github.io/exchange/
```

### 2. Cloudflare Worker 연결

Cloudflare 계정에서 API token을 만든다. 토큰은 Worker 편집 권한으로 이 프로젝트의 계정으로만 범위를 제한한다.

GitHub 저장소 Settings → Secrets and variables → Actions에 다음 secrets를 등록한다.

```text
CLOUDFLARE_API_TOKEN=<Cloudflare Worker 배포 토큰>
CLOUDFLARE_ACCOUNT_ID=<Cloudflare 계정 ID>
DEEPL_API_KEY=<DeepL API 키>
```

`DEEPL_API_KEY`는 GitHub Actions가 Cloudflare Worker secret으로 전송한다. 소스 코드, GitHub Pages, 브라우저, 로그에는 넣지 않는다.

이후 `main`에 Push하면 `Deploy translation Worker`가 `nz-exchange-news-translate` Worker를 배포한다. Cloudflare가 반환한 Workers.dev 주소는 아래 형식이다.

```text
https://nz-exchange-news-translate.<Cloudflare-subdomain>.workers.dev
```

### 3. GitHub Pages에 Worker 주소 연결

GitHub 저장소 Settings → Secrets and variables → Actions → Variables에 다음 공개 변수를 등록한다.

```text
TRANSLATION_API_BASE=https://nz-exchange-news-translate.<Cloudflare-subdomain>.workers.dev
```

이 값은 비밀이 아니며 HTTPS origin만 허용한다. 설정 후 `Deploy site to GitHub Pages` workflow를 다시 실행하거나 빈 커밋을 Push한다.

## 운영 확인

다음 주소를 차례대로 확인한다.

```text
https://jazzin37.github.io/exchange/
https://nz-exchange-news-translate.<Cloudflare-subdomain>.workers.dev/api/health
```

Worker health 응답의 `deepl_configured`가 `true`이면 DeepL 키가 Cloudflare Worker에 안전하게 등록된 상태다. 키 값 자체는 응답하지 않는다.

GitHub Pages 화면에서 제목 또는 본문을 입력하고 `번역`을 눌러 한국어/영어/러시아어 번역이 반환되는지 확인한다. `전체 이미지로 게시판 등록`은 미리보기를 생성한 뒤 최종 확인 시 전체 이미지를 학교 서버에 업로드하여 본문에 표시한다. 게시 대상은 다음 국제교류 게시판이다.

```text
https://anseong-e.goean.kr/anseong-e/na/ntt/insertNttPage.do?mi=6436&bbsId=3783
```

이미지 게시 전 `/api/health`의 `publish_format`이 `newspaper-images-v1`인지 프런트엔드가 확인한다. Pages만 갱신되고 Worker가 아직 이전 버전인 경우 텍스트로 대체 게시하지 않고 중단한다. CI 및 두 배포 워크플로는 `worker/test/*.test.mjs` 전체를 실행한다. 학교의 이미지 업로드 규격 변경 시 `worker/src/board-images.mjs`와 수동 시험용 `scripts/verify-image-upload.mjs`를 함께 점검한다.

## 보안 원칙

- DeepL 키, Cloudflare API token, 계정 ID는 채팅·코드·README·브라우저에 입력하지 않는다.
- 실제 값은 GitHub Actions secrets에서만 사용한다.
- `TRANSLATION_API_BASE`만 GitHub Actions variable로 공개한다.
- Worker는 `https://jazzin37.github.io` Origin에만 CORS 헤더를 발급한다.
- Cloudflare API token은 Worker 편집 권한과 대상 계정으로 최소 범위로 제한한다.
