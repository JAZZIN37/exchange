# 안성초등학교-바이테렉 과학기술학교 국제교류

안성초등학교와 바이테렉 과학기술학교의 국제교류 신문을 만드는 웹앱이다.

## 구현한 기능

- 반응형 HTML 신문 편집기
- 제목·본문·사진 입력
- DeepL API를 이용한 한국어·영어·러시아어 상호 번역
- 신문 지면 PNG 저장
- 게시판 자동입력용 payload 생성
- Chrome/Edge 확장 프로그램으로 안성초등학교 게시판에 제목·본문·사진 자동 입력 준비
- 로그인 비밀번호와 세션을 저장하지 않음
- DeepL 키는 서버 환경변수에만 저장

## 중요한 보안 원칙

`DEEPL_API_KEY`를 `static/index.html`, GitHub 저장소, Chrome 확장 프로그램에 절대 넣지 않는다. 브라우저는 `/api/translate`만 호출하고, Flask 서버가 DeepL API를 호출한다.

## Windows + WSL에서 실행

1. WSL에서 프로젝트 폴더로 이동한다.
2. 최초 1회 가상환경을 만들고 의존성을 설치한다.

```bash
cd "/mnt/c/Users/user/Desktop/GPT 작업/20260806_093816_NZ교류신문_OpenAI_배포앱"
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

3. DeepL 키를 현재 WSL 셸의 환경변수로 설정한다. 실제 키를 파일이나 채팅에 기록하지 않는다.

```bash
read -rsp "DeepL API key: " DEEPL_API_KEY
echo
export DEEPL_API_KEY
export DEEPL_API_BASE_URL="https://api-free.deepl.com"
```

DeepL Pro API 키라면 다음으로 바꾼다.

```bash
export DEEPL_API_BASE_URL="https://api.deepl.com"
```

4. 서버를 실행한다.

```bash
python3 app.py
```

5. 브라우저에서 `http://127.0.0.1:5000/`을 연다.

Windows에서는 `start_windows.bat`를 더블클릭할 수도 있다. 단, API 키는 같은 WSL 셸에서 직접 입력하고 `python3 app.py`를 실행하는 방식이 가장 확실하다.

## 키 없이 전체 기능 검증

실제 키를 저장하지 않고 다음처럼 목업 번역을 사용할 수 있다.

```bash
MOCK_TRANSLATION=1 python3 app.py
```

기존 명령과의 호환을 위해 `MOCK_OPENAI=1`도 임시로 인식한다.

```bash
MOCK_TRANSLATION=1 python3 -m unittest discover -s tests -v
```

## DeepL API 주소

- DeepL Free: `https://api-free.deepl.com`
- DeepL Pro: `https://api.deepl.com`
- 번역 endpoint: `/v2/translate`
- 인증 방식: `Authorization: DeepL-Auth-Key <server-only-key>`

앱은 한국어·영어·러시아어를 자동 감지하고, 입력 언어를 제외한 두 언어로 번역한다. 영어 결과는 `EN-US`로 요청한다.

게시판 자동 등록은 안성초등학교 **국제교류(TEST)** 게시판의 글쓰기 화면을 여는 방식으로 동작한다. 게시판은 로그인과 최종 등록 확인이 필요하므로 비밀번호를 앱에 저장하거나 자동 입력·자동 제출하지 않는다. 사용자가 로그인한 뒤 Chrome/Edge 확장 프로그램이 제목·본문·이미지를 입력하고, 사용자가 내용을 확인해 게시판의 등록 버튼을 누른다.

- 게시판 목록: `https://anseong-e.goean.kr/anseong-e/na/ntt/selectNttList.do?mi=6401&bbsId=3783`
- 게시판 글쓰기: `https://anseong-e.goean.kr/anseong-e/na/ntt/insertNttPage.do?mi=6401&bbsId=3783`


이 앱은 DeepL 키가 필요한 Flask 백엔드 앱이므로 GitHub Pages 단독 배포가 아니라 **Vercel Python Function 또는 Render Web Service**로 배포한다. 현재 기본 대상은 Vercel이다.

### Vercel 배포

저장소 루트의 `vercel.json`과 `api/index.py`가 Flask 앱을 Vercel Python Function으로 연결한다.

```bash
npm install -g vercel
vercel login
cd "/mnt/c/Users/user/Desktop/GPT 작업/20260806_093816_NZ교류신문_OpenAI_배포앱"
vercel link
vercel --prod
```

Vercel Project Settings → Environment Variables에 다음을 등록한다.

```text
DEEPL_API_KEY=<실제 DeepL 키>
DEEPL_API_BASE_URL=https://api-free.deepl.com
ALLOWED_ORIGINS=
```

실제 키는 채팅·GitHub·브라우저 코드에 넣지 말고 Vercel 환경변수에 직접 입력한다. 배포 후 다음을 확인한다.

```text
https://<프로젝트>.vercel.app/
https://<프로젝트>.vercel.app/api/health
```

### GitHub 저장소 준비

이미 Git이 설치된 폴더라면 다음처럼 저장소를 초기화하고 첫 커밋을 만든다.

```bash
git init
git branch -M main
git add .
git commit -m "feat: prepare DeepL-backed NZ exchange news app"
```

그 다음 GitHub에서 빈 저장소를 만든 뒤 원격 저장소를 추가하고 Push한다.

```bash
git remote add origin https://github.com/<사용자명>/<저장소명>.git
git push -u origin main
```

`.env`, `.venv`, 캐시 파일은 `.gitignore`로 제외되어 있다. `DEEPL_API_KEY`나 실제 키가 들어 있는 파일은 절대 커밋하지 않는다.

### Render 배포

1. Render에서 **New > Blueprint**를 선택한다.
2. 위 GitHub 저장소를 연결한다.
3. 저장소 루트의 `render.yaml`을 적용한다.
4. Render 환경변수에서 `DEEPL_API_KEY`를 직접 등록한다.
5. DeepL Free 계정이면 `DEEPL_API_BASE_URL=https://api-free.deepl.com`, Pro 계정이면 `https://api.deepl.com`으로 둔다.
6. 배포가 끝나면 `https://<render-service>.onrender.com/api/health`가 HTTP 200인지 확인한다.
7. 같은 서비스가 화면과 API를 함께 제공하므로 `https://<render-service>.onrender.com/`에서 바로 사용한다.

`render.yaml`의 `autoDeploy: true` 때문에 main 브랜치에 Push할 때마다 Render가 자동 재배포한다. GitHub Actions의 `CI` workflow는 Push/PR 때 목업 번역 테스트와 정적 검사를 실행한다.

정적 GitHub Pages 프런트엔드를 별도로 운영하려면 API 서버의 `ALLOWED_ORIGINS`에 정확한 Pages 주소를 쉼표로 등록하고, 화면에서 `window.NZ_API_BASE`를 Render API 주소로 설정해야 한다. 기본 배포는 CORS 설정이 필요 없는 Render 단일 서비스 방식을 권장한다.

## 게시판 자동입력

현재 안성초등학교 글쓰기 URL은 다음과 같다.

```text
https://anseong-e.goean.kr/anseong-e/na/ntt/insertNttPage.do?bbsId=3782&mi=6400
```

게시판은 통합 로그인으로 이동하므로 확장 프로그램이 다음 방식으로 동작한다.

1. 편집기에서 `게시판 자동입력 준비` 클릭
2. payload를 확장 프로그램 저장소에 저장
3. 학교 게시판 열기
4. 필요하면 로그인
5. 게시판 화면의 `📤 신문 내용 자동입력` 버튼 클릭
6. 제목·본문·가능한 경우 이미지 파일을 입력
7. 내용을 직접 확인한 뒤 게시판의 최종 등록 버튼 클릭

HTML만으로 다른 도메인의 로그인 페이지와 게시판 DOM을 조작할 수 없기 때문에 확장 프로그램이 필요하다. CAPTCHA, 추가 인증, 게시판 구조 변경이 있으면 자동입력이 중단될 수 있다.

### 확장 프로그램 설치

1. Chrome/Edge 주소창에 `chrome://extensions` 또는 `edge://extensions` 입력
2. 개발자 모드 활성화
3. `압축해제된 확장 프로그램을 로드` 선택
4. 이 폴더의 `board-autofill-extension` 선택
5. 공개 배포 후에는 `manifest.json`의 `YOUR-PRODUCTION-DOMAIN.example`를 실제 고정 주소로 바꾼 뒤 다시 로드

현재 실제 게시판은 로그인으로 리디렉션되므로, 비밀번호를 자동 저장하거나 자동 입력하지 않는다. 최종 등록은 사용자가 확인해야 한다.

## 공개 배포 전 점검

- [ ] `DEEPL_API_KEY`가 GitHub 파일에 없는가
- [ ] DeepL 키를 Render/Vercel/서버 환경변수로 등록했는가
- [ ] `DEEPL_API_BASE_URL`이 Free/Pro 계정과 일치하는가
- [ ] `/api/health`에서 키 값이 노출되지 않고 준비 상태만 표시되는가
- [ ] 번역 요청 제한이 설정되어 있는가
- [ ] custom domain을 정했는가
- [ ] 확장 프로그램 manifest에 실제 앱 주소를 추가했는가
- [ ] 로그인 후 테스트 게시판에서 제목·본문·사진이 올바른 위치에 들어가는가
- [ ] 자동입력 후 최종 등록 버튼은 사람이 확인하는가

## 파일 구조

```text
app.py
requirements.txt
render.yaml
DEPLOYMENT.md
.env.example
.gitignore
start_windows.bat
static/
  index.html
  manifest.json
board-autofill-extension/
  manifest.json
  content.js
.github/
  workflows/
    ci.yml
tests/
  test_app.py
```
# exchange
