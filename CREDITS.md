# 출처 · 크레딧

## 게임

"Sword x Staff / 소드 x 스태프" 및 관련 명칭 · 수치의 권리는 각 권리자에게 있습니다. 이 도구는 팬이 만든 비공식 계산기이며 게임의 이미지 · 음악 · 텍스트 자산을 포함하지 않습니다.

## 전투 공식 · 수치 (커뮤니티 자료)

- **Purrwikimania** — https://www.purrwikimania.com/combat/
  피해 계산 순서, 속도(행동 간격), 치명 · 막기, 원소 배율, 레벨 보정, 팀 전투 규칙, 스킬 계수 · 레벨 기준표, 적 능력치 · 층 구성,
  몹 스킬과 몹 · 보스 비전(패시브) 71종의 설명(`tools/passives.mjs` 의 전투 모델과 한국어 번역 이름은 이 설명을 바탕으로 이 프로젝트에서 만든 것입니다),
  판타몬 19종의 지원 · 실체화 스킬 · 비전 설명과 품질별 수치(`/pets`; `tools/pets_fx.mjs` 의 전투 모델과 한국어 번역도 이 프로젝트에서 만든 것입니다).
  `js/gamedata.js` 의 수치는 이 사이트가 정리한 표에서 계산기에 필요한 부분(직업 18종의 전투스킬, 판타지아 등반 4개 지역)을 추려 변환한 것입니다.
- **Purrwikimania 결투 시뮬레이터** — https://www.purrwikimania.com/combat/duel
  배틀 화면 구성(행동 타임라인 · 한 행동씩 보기 · 전투 로그 · 전장 효과 표시 · 다시 볼 전투 고르기 · 시작 위치 지정)을 참고했습니다. 화면과 그림은 이 프로젝트에서 새로 만들었고, 그 사이트의 그림 · 코드는 쓰지 않았습니다.
- **Keripo — "[Sword x Staff] Damage Formula (Datamined)"** — https://keripo.com/2026/10/sword-x-staff-damage-formula-datamined/
  (원 정리: Reddit r/SwordxStaff_Official, 디컴파일 u/ninjan74) 피해 구간(Z1~Z6) 구조와 판정 순서 교차 확인.

수치는 패치로 달라질 수 있으며, 오류가 있다면 이 도구의 변환 · 모델링 과정에서 생긴 것입니다.

- **소드X스태프허브 (metahub.wiki)** — https://metahub.wiki/swordxstaff/ko/
  한국판 직업 · 스킬 · 비법 명칭을 같은 스킬 ID 기준으로 대조하는 데 사용했습니다.

- **소드×스태프 한섭 위키 (레딘)** — https://sxswiki-ledin-kr.netlify.app/
  콘텐츠 이름(환상계단 · 이그드라실 · 기신산 · 신수 시련), 신수 이름, 판타몬 7종의 한국 서버 명칭을 대조했습니다.

## 그림

- **SD 직업 그림(`assets/sheets/`)** — 이 계산기 이용자가 제공한 「2D 게임 에셋 개발 시트」 6종(전사 · 마법사 · 기사 · 투사 · 주술사 · 현자)에서
  마스터 모델 · 방향 시트 · 동작 프레임 · 표정 · 이펙트를 `tools/extract_sheets.py` 로 잘라 배경을 지운 것입니다. 원본 시트는 저장소에 포함하지 않습니다.

- **GPT 6.1 sol 생성 SVG** — `assets/gpt/` 의 영웅 18종(직업별)과 몹 42종은 `tools/gen_art.mjs` 의 지시문으로 OpenAI GPT 6.1 sol(Codex CLI)이 새로 그린 그림입니다.
  게임의 공식 일러스트를 따라 그린 것이 아니며, 계산기에서 레이어(back/body/head/weapon) 분리 · 재채색 · 스티커 테두리 · 애니메이션을 더해 사용합니다.
- **전투 스킬 · 비법 아이콘(`assets/skills/`)과 한국어 스킬 이름 · 설명**은 게임사 저작물로 권리는 각 권리자에게 있습니다.
  [소드X스태프허브 스킬 도감](https://metahub.wiki/swordxstaff/ko/database/)에 공개된 한국판 리소스를 스킬 ID 기준으로 가져와, 비영리 팬 계산기에서 식별용으로만 씁니다.
  권리자의 요청이 있으면 즉시 내리겠습니다.
- **몹 스킬 · 비전 아이콘(`assets/mobskills/`)** 역시 게임 저작물이며, Purrwikimania 적 정보 페이지에 공개된 파일을 같은 목적·조건으로 씁니다.
- **game-icons.net** — https://game-icons.net — CC BY 3.0 (https://creativecommons.org/licenses/by/3.0/)
  Lorc, Delapouite, Skoll, Carl Olsen 외 기여자의 실루엣 아이콘을 [Iconify](https://iconify.design) `game-icons` 묶음에서 가져와
  재채색 · 외곽선 · 스티커 테두리 · 합성 · 애니메이션을 더해 **몹 스탠디**와 **영웅의 무기 · 장식 부품**으로 재구성했습니다(`js/icons.js`, `js/sprites.js`).
  사용한 아이콘 이름은 `tools/build_icons.mjs` 에 있습니다.
- 영웅 캐릭터(기사 · 투사 · 주술사 · 현자 계열)의 몸 · 얼굴 · 의상 리그와 3D 디오라마(섬, 나무, 폭포, 터미널 모놀리스)는 이 프로젝트에서 새로 그린 것입니다.

## 라이브러리 · 글꼴

- **three.js** r160 — MIT — `vendor/THREE-LICENSE.txt`
- **Pretendard** — SIL Open Font License 1.1 (CDN 로드)
- **JetBrains Mono** — SIL Open Font License 1.1 (Google Fonts 로드)

터미널 화면은 Claude Code CLI의 분위기를 본뜬 장식이며 Anthropic의 공식 제품 화면이 아닙니다.
