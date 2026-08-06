# GitHub → Render 배포 안내

이 앱은 정적 HTML만으로 동작하지 않는다. DeepL API 키를 브라우저에 노출하지 않기 위해 Flask 서버가 `/api/translate`를 제공한다.

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

## 보안 주의

- 실제 키를 GitHub 파일, README, `.env.example`, 브라우저 코드에 넣지 않는다.
- Render의 Environment Variables에만 실제 키를 저장한다.
- 키가 커밋되었다면 즉시 DeepL 콘솔에서 폐기·재발급하고 GitHub 기록에서도 제거한다.
- GitHub Pages를 별도 프런트엔드로 사용할 때만 `ALLOWED_ORIGINS`에 정확한 Pages 주소를 등록한다.
