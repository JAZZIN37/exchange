# 안성초등학교-바이테렉 과학기술학교 국제교류

안성초등학교와 바이테렉 과학기술학교의 국제교류 신문을 작성·번역·게시판 입력 준비할 수 있는 웹앱이다.

## 기능

- 제목·본문·사진을 직접 편집하는 반응형 신문 화면
- 한국어·영어·러시아어 상호 번역
- 제목·사진·번역·본문·하단까지 전체 신문을 가로 1,600px PNG로 변환
- 이미지 미리보기 및 원본 크기 확대, 이미지별 PNG 저장
- 학교 ID/PW를 요청 한 번에만 사용하여 전체 이미지를 국제교류 게시판에 등록
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
node --test worker/test/*.test.mjs
node --check board-autofill-extension/content.js
```

## 전체 이미지 게시

1. 제목·본문·사진을 입력하고 필요한 번역을 완료한다.
2. `전체 이미지로 게시판 등록`을 누른다.
3. 이미지 미리보기에서 전체 내용과 글씨를 확인한다. `원본 크기로 보기`로 확대할 수 있다.
4. 학교 홈페이지 아이디·비밀번호를 입력하고 이미지 확인 동의에 체크한다.
5. `확인 후 즉시 게시`를 누른다. 업로드 또는 이미지 검증 실패 시 텍스트만 대신 올리지 않는다.
6. 표시된 게시판 확인 링크로 결과를 확인한다. 게시물 읽기 검증이 불가능한 경우에는 재등록하지 말고 먼저 게시판을 확인한다.

게시 대상:

```text
https://anseong-e.goean.kr/anseong-e/na/ntt/selectNttList.do?mi=6436&bbsId=3783
```

현재 GitHub Pages 게시 기능에는 확장 프로그램이 필요하지 않다. 최종 확인 이후 Worker가 입력한 계정으로 로그인하여 학교 DEXT5 이미지 업로드를 수행하고, 검증된 PNG의 본문 표시와 원본 링크를 등록한다. 비밀번호는 localStorage 등에 보관하지 않으며 요청 완료·실패·취소 시 입력칸을 비운다.

### 가독성과 제한

- PC·휴대전화에서 같은 800 CSS px 지면을 2배 PNG로 생성한다. 본문 24px, 번역 22px 기준이다.
- 긴 글은 글씨를 작게 만들지 않고 글줄 사이에서 세로로 나누어 순서대로 게시한다. 본문에서 이미지 클릭 시 원본을 확대해 볼 수 있다.
- PNG 한 장 최대 4MiB, 전체 최대 10MiB, 최대 20장. 한 장은 가로 1,600px, 세로 최대 3,200px다. 한도 초과 시 자동 축소 대신 사진 용량을 줄이거나 내용을 나누라는 안내를 표시한다.
- `이미지로 저장`은 같은 품질의 미리보기와 이미지별 다운로드 링크를 제공한다.
- 게시물 자체를 만들지 않는 실제 업로드 점검은 `Diagnose school login without posting` 워크플로의 `image_upload_probe`를 수동 선택한다. 표시된 시험용 PNG 1개만 업로드하며 최종 등록 HTTP 요청은 차단한다.
- 로컬 실제 브라우저 회귀 테스트: `pip install playwright pillow` 후 `python scripts/test-image-export.py --output <검증폴더>` (설치된 Chrome 사용). 테스트는 합성 문서와 가짜 계정·모의 응답을 사용하며 실제 게시 요청을 보내지 않는다.

`board-autofill-extension`은 이전 수동 입력 방식의 호환용 자료다. 현재 이미지 게시 경로에는 사용하지 않는다. Flask 로컬 서버는 번역·이미지 생성용이며 학교 게시 API는 배포된 Worker가 담당한다.

## 보안

- `DEEPL_API_KEY`, Cloudflare API token, 학교 로그인 비밀번호를 소스·README·브라우저·채팅에 넣지 않는다.
- GitHub Actions secrets에서만 Cloudflare Worker 배포와 DeepL secret 등록에 사용한다.
- 공개 GitHub Pages 코드에는 Worker의 공개 HTTPS 주소만 설정한다.
