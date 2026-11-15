# 소드 x 스태프 전투 계산기 (비공식)

직업 · 공격 · 방어 · 생명 · 속도 · 전투스킬을 입력하면 몬테카를로 시뮬레이션으로 **승리 확률**을 계산하는 팬 제작 도구입니다.
1:1, 다대일, 다대다(팀 구성), 몹 지정을 지원하고, 대표 전투 한 판을 3D 디오라마에서 재생합니다.

- **전투 스킬 4칸** (칸 순서 = 사용 순서, ▲▼로 순번 변경) · **비법 4칸** · **판타몬**(지원 스킬 + 성년 실체화, 공격·방어·생명·속도 입력)
- **전투 불러오기**: 판타지아 등반 585층, 일일 던전 28종(방별), 길드 토벌(길드 보스) 89층, 신수의 시련(히에로몬) 20단계
- **그림**: 캐릭터 18직업과 몹 42종은 GPT 6.1 sol이 그린 SVG(`assets/gpt`)를 레이어 분리·재채색해 애니메이션합니다
- **공식 명칭 · 아이콘**: 전투 스킬 118종 · 비법 114종의 한국판 이름 · 설명 · 아이콘(`assets/skills/skill_<ID>.webp`)과 직업명, 능력치 · 상태 이상 용어를 한국판 게임 리소스 기준으로 표기합니다(소드X스태프허브 스킬 도감 대조)

> 게임 개발사·퍼블리셔와 무관한 비공식 도구입니다. 결과는 커뮤니티가 정리한 공식에 기반한 추정치입니다.

## 실행

빌드 과정이 없는 정적 사이트입니다. ES 모듈과 Web Worker를 쓰므로 `file://`로 직접 열지 말고 로컬 서버로 여세요.

```bash
node serve.mjs
```

브라우저에서 `http://localhost:5173` 을 엽니다. (포트 변경: `PORT=8080 node serve.mjs`)

엔진 점검:

```bash
node tools/test_engine.mjs
```

## 배포

폴더 전체를 그대로 올리면 됩니다. 모든 경로가 상대 경로라 하위 경로(`https://example.com/sxs/`)에서도 동작합니다.

| 호스팅 | 방법 |
| --- | --- |
| GitHub Pages | 저장소에 푸시 → Settings › Pages › Branch 지정 (루트) |
| Netlify / Cloudflare Pages / Vercel | 빌드 명령 없음, 출력 디렉터리 = 저장소 루트 |
| 일반 웹서버 | 폴더 복사. `.js`가 `text/javascript`, `.webmanifest`가 `application/manifest+json`으로 나가면 충분 |

외부 요청은 글꼴 2종(Pretendard, JetBrains Mono)뿐이며, 막혀 있어도 시스템 글꼴로 동작합니다. three.js는 `vendor/`에 포함되어 있습니다.
`tools/` 폴더는 개발용이므로 배포에서 빼도 됩니다.

## 구조

```
index.html            화면 뼈대
css/style.css         스타일
js/app.js             팀 구성 UI · 실행 · 결과
js/engine.js          전투 시뮬레이터 (브라우저 · 워커 · Node 공용)
js/worker.js          몬테카를로 워커
js/scene.js           3D 디오라마 · 전투 재생 · 터미널 화면
js/sprites.js         스탠디 캐릭터(영웅 리그, 몹 스티커)
js/art.js             GPT SVG 로더(영웅 레이어 분리, 몹 재채색)
js/gamedata.js        생성 파일: 스킬 · 몹 · 층 · 레벨 기준표
js/gamedata2.js       생성 파일: 한국판 명칭 · 설명 · 비법 · 판타몬 · 던전/길드 토벌/신수
js/icons.js           생성 파일: 보조 실루엣 path
assets/gpt/           GPT 6.1 sol이 만든 캐릭터·몹 SVG (hero_<직업키>.svg, mob_<종류>.svg)
assets/skills/        전투 스킬 · 비법 공식 아이콘 232개 (skill_<ID>.webp)
tools/build_data.mjs  위키 페이지 → gamedata.js
tools/build_extra.mjs 위키·허브 페이지 → gamedata2.js
tools/build_icons.mjs 아이콘 번들 → icons.js
tools/gen_art.mjs     Codex CLI로 GPT에게 스프라이트를 그리게 하는 스크립트
tools/test_extra.mjs  비법 · 판타몬 · 추가 전투 점검
```

그림을 다시 만들거나 추가하려면(`codex` CLI 로그인 필요):

```bash
node tools/gen_art.mjs --only hero_Fashi,mob_boar --force
```

구성은 브라우저 `localStorage`에 저장되고, 「링크 복사」는 구성을 URL 해시에 담아 공유합니다(서버 저장 없음).

## 계산 방식 요약

- **행동 순서**: 행동 간격 = 100000 ÷ √속도. 한 턴에 최대 4칸 이동 후 준비된 전투스킬을 슬롯 순서대로 모두 시전.
- **대미지**: (공격력×계수+고정값) × 공격력/(공격력+방어력) × 원소 배율 × (1+대미지 보너스)/(1+대미지 저항) × 막기·치명타 × 레벨 보정.
- **판정**: 실명 → 회피 → 막기 → 치명타. 막기 시 ÷max(1.5, 1+막기 대미지 저항−명중), 치명타 시 ×max(1.3, 1+치명타 대미지−치명타 저항).
- **PvP 전장 보정**: 캐릭터 대상 대미지 ×0.2, 12라운드부터 라운드마다 +10%p, 치유·실드 감소, 제어 효과 확률 1/3.
- **격자**: 21×20 보드, 5칸 폭 진형 자동 배치, 「많이 맞히는 위치 → 짧은 이동 → 낮은 체력 비율」 순으로 대상 선택.

### 추정·미반영

- 몹 스킬 계수·쿨다운은 공개 자료가 없어 턴당 1스킬 · 계수 100%로 가정(화면에서 조정 가능).
- 침식 등 지속 대미지는 턴당 공격력 25%로 추정.
- 소환수 · 분신 · 설치물 · 화상 지대 · 넉백 충돌 · 공포 · 열상, 등급(랭크) 보정은 반영하지 않습니다.
- 비법은 114종 중 77종을 반영하고 나머지는 ⚠로 표시합니다. 레벨 비례 고정 수치는 근사값입니다.
- 판타몬 지원 스킬은 19종 중 15종을 반영합니다(만드라고라 · 이지스윙 · 양배추 강아지 · 프리즈모라는 미반영). 판타몬 한글 이름은 임의 표기입니다.
- 길드 토벌 · 신수의 시련은 대미지 경쟁이므로 승률 대신 「아군 평균 총 대미지」를 보세요. 층별 길드 토벌 강화 효과는 미반영입니다.
- 품질 이름(희귀~불멸), 판타몬 · 몹 이름, 판타지아 등반 · 신수의 시련 같은 콘텐츠 이름은 한국어 공식 명칭을 확인하지 못해 임시 번역입니다.
- 스킬 · 직업 이름은 한국판 명칭(소드X스태프허브 대조)을 쓰고, 대조되지 않은 항목과 몹 이름은 비공식 번역입니다.

## 데이터 갱신

`tools/build_data.mjs` 는 내려받아 둔 위키 페이지(스킬 표, 스탯 기준표, 적 데이터 JSON)를 읽어 `js/gamedata.js`를 다시 만듭니다.
패치 후 수치가 바뀌면 같은 페이지를 다시 받아 실행하세요. 한글 이름과 스킬별 모델링 예외는 스크립트 안의 `OV`, `KO_MOB` 표에서 고칩니다.

```bash
node tools/build_data.mjs <내려받은_폴더> js/gamedata.js
```

스크립트가 읽는 파일 이름(모두 `https://www.purrwikimania.com` 기준, 원본 페이지는 저장소에 포함하지 않습니다):

| 저장할 파일명 | 경로 |
| --- | --- |
| `skills.html` | `/combat/skills` |
| `base-stats.html` | `/base-stats` |
| `stat-conversion.html` | `/stat-conversion` |
| `curves.json` | `/assets/curves.json` |
| `enemies_index.json` | `/assets/enemies/_index.json` |
| `enemy_skills.json` | `/assets/enemies/skills.json` |
| `fantasia_fa1.json` ~ `fantasia_fa4.json` | `/assets/enemies/fantasia_fa1.json` … |
| `curve_0.json`, `curve_1.json`, `curve_2.json`, `curve_st.json` | `/assets/enemies/curve_0.json` … |

`tools/build_extra.mjs <위키_폴더> <추가_폴더> js/gamedata2.js` 는 위 폴더에 더해 `conquest_gc.json`, `crucible_cr*.json`, `dungeons_dd*.json`, `curve_3.json`(모두 `/assets/enemies/`)과,
추가 폴더의 `pets.html`(`/pets`), `metahub_database.html`(`https://metahub.wiki/swordxstaff/ko/database/`, 한국판 스킬 · 비법 이름 · 설명 · 아이콘 주소), `metahub_builder.html`(`…/ko/builder/`, 보조 대조용)을 읽습니다.

아이콘은 `https://api.iconify.design/game-icons.json?icons=이름,이름,…` 응답을 저장해 `node tools/build_icons.mjs <json> js/icons.js` 로 만듭니다.

## 출처 · 라이선스

[CREDITS.md](CREDITS.md) 참고.
