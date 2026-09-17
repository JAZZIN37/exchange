# 안성초등학교-바이테렉 과학기술학교 국제교류

안성초등학교와 바이테렉 과학기술학교의 국제교류 신문을 작성·번역·게시판 입력 준비할 수 있는 웹앱이다.

## 기능

- 제목·본문·사진을 직접 편집하는 반응형 신문 화면
- 한국어·영어·러시아어 상호 번역
- 신문 지면 PNG 저장
- 안성초 국제교류 게시판 글쓰기 화면 열기 및 확장 프로그램 자동입력 payload 생성
- DeepL 키·학교 로그인 비밀번호를 브라우저 코드나 저장소에 보관하지 않음

## 영구 배포 구조

- 화면: GitHub Pages
  `https://jazzin37.github.io/exchange/`
- 번역 API: Cloudflare Worker
  `https://nz-exchange-news-translate.<Cloudflare-subdomain>.workers.dev`
- 자동 배포: GitHub Actions의 main Push workflow

GitHub Pages는 정적 웹 호스팅만 제공하므로 DeepL 키를 안전하게 보관할 수 없다. GitHub Pages는 화면을 제공하고, Cloudflare Worker가 서버 측에서 DeepL 번역을 수행한다.

최초 설정 절차와 필요한 GitHub secrets/variables는 `DEPLOYMENT.md`를 따른다.

## 로컬 실행

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
MOCK_TRANSLATION=1 python app.py
```

브라우저에서 `http://127.0.0.1:5000/`을 연다. 실제 DeepL 번역을 로컬에서 확인할 때는 셸 환경변수 `DEEPL_API_KEY`를 설정하되, 파일이나 채팅에 기록하지 않는다.

## 테스트

```bash
MOCK_TRANSLATION=1 python -m unittest discover -s tests -v
node --test worker/test/translate-worker.test.mjs
node --check board-autofill-extension/content.js
```

## 게시판 자동입력

게시판 등록 버튼은 다음 국제교류 게시판 글쓰기 페이지를 연다.

```text
https://anseong-e.goean.kr/anseong-e/na/ntt/insertNttPage.do?mi=6436&bbsId=3783
```

Chrome/Edge 확장 프로그램은 로그인 이후 제목·본문·사진을 입력한다. 학교 로그인·권한·최종 게시 결정은 사용자가 확인해야 하므로 비밀번호 저장, 자동 로그인, 최종 등록 버튼 클릭은 하지 않는다.

확장 프로그램 설치:

1. Chrome/Edge에서 `chrome://extensions` 또는 `edge://extensions`를 연다.
2. 개발자 모드를 켠다.
3. `압축해제된 확장 프로그램을 로드`를 선택한다.
4. 저장소의 `board-autofill-extension` 폴더를 선택한다.

## 보안

- `DEEPL_API_KEY`, Cloudflare API token, 학교 로그인 비밀번호를 소스·README·브라우저·채팅에 넣지 않는다.
- GitHub Actions secrets에서만 Cloudflare Worker 배포와 DeepL secret 등록에 사용한다.
- 공개 GitHub Pages 코드에는 Worker의 공개 HTTPS 주소만 설정한다.
