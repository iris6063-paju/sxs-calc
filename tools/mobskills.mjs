// Monster skills that deal no direct damage of their own (self / ally buffs, heals, shields, stances, ground effects,
// summons): Korean name / description (unofficial translations: no official Korean text was found for monster skills)
// and how the engine plays each one. The game data the calculator reads (purrwikimania.com assets/enemies/skills.json)
// has only the name, the description and the icon of these skills, so every size the text does not give is our
// estimate: est 1 marks those (they run only while "몹 비전·스킬 추정값 반영" is on). Damage from them uses the
// mob-skill coefficient, like every monster skill.
//
// spec.k: buff | heal | hot | shield | voidShield | rage | stance | counterSt | summon | clone | bomb | web | burn | aura | none
//   to: 'self' (default) | 'allies' (within r of the caster, itself included unless ex) · t: turns · nd: cannot be dispelled
//   st: [status, size]: defUp / atkUp / spdUp (share of the holder's own DEF / ATK / SPD), abreak (DEF −share),
//       blockUp / critUp / dodgeUp / accUp (+ rate), immob (cannot move), blockCtr (counter on each block, el),
//       next (the next damage skill +share), boon (stacking DMG +share per stack up to max)
//   open: cooldown ready at battle start · pre: cast once before the battle starts · retreat: grids moved away after
const B = (st, t, o = {}) => ({ k: 'buff', st, t, est: 1, ...o });
const ALLY_ATK = (r) => B([['atkUp', 0.2]], 2, { to: 'allies', r });
export const MOB_SKILL = {
  // self counter states: the text gives everything but the counter's coefficient (the mob-skill coefficient)
  14133: ['기세 반격', '자기 다음 턴 시작까지 반격 태세(해제 불가). 그동안 전투 스킬에 맞으면 공격자에게 빛 원소 대미지 1회', { k: 'counterSt', el: 'light', next: 1, nd: 1 }],
  14380: ['반사 가면', '1턴 동안 자신에게 반사 효과. 전투 스킬 대미지를 받으면 공격자에게 물리 대미지 1회', { k: 'counterSt', el: 'phy', t: 1 }],
  14462: ['껍질 웅크리기', '1턴 동안 껍질 웅크리기 상태(해제 불가). 그동안 전투 스킬에 맞으면 공격자에게 물 원소 대미지 1회', { k: 'counterSt', el: 'water', t: 1, nd: 1 }],
  // self stat buffs (sizes estimated: +30%, "greatly" +60%)
  14210: ['방어 태세', '2턴 동안 자신의 방어력 증가', B([['defUp', 0.3]], 2)],
  14204: ['돌 피부', '2턴 동안 자신의 방어력 증가', B([['defUp', 0.3]], 2)],
  14453: ['껍질 웅크리기', '1턴 동안 자신의 방어력 증가', B([['defUp', 0.3]], 1)],
  14314: ['거울 닦기', '2턴 동안 공격력 증가', B([['atkUp', 0.3]], 2)],
  14451: ['불꽃', '2턴 동안 자신의 공격력 증가', B([['atkUp', 0.3]], 2)],
  14331: ['뿔 방패', '2턴 동안 자신의 막기율 증가', B([['blockUp', 0.3]], 2)],
  14305: ['부동', '2턴 동안 자신의 막기율 증가', B([['blockUp', 0.3]], 2)],
  14179: ['방패 들기', '1턴 동안 자신의 막기율 증가(해제 불가)', B([['blockUp', 0.3]], 1, { nd: 1 })],
  14247: ['방패 들기', '1턴 동안 자신의 막기율 증가(해제 불가)', B([['blockUp', 0.3]], 1, { nd: 1 })],
  14335: ['방패 들기', '1턴 동안 자신의 막기율 증가(해제 불가)', B([['blockUp', 0.3]], 1, { nd: 1 })],
  14263: ['매혹의 눈길', '2턴 동안 자신의 회피율 증가', B([['dodgeUp', 0.3]], 2)],
  14106: ['에너지 집중', '5턴 동안 자신의 치명타율 증가', B([['critUp', 0.3]], 5)],
  14491: ['해넘이', '3턴 동안 무기에 마력을 담아 치명타율·명중 대폭 증가', B([['critUp', 0.5], ['accUp', 0.5]], 3)],
  14217: ['미풍의 축복', '2턴 동안 자신의 방어력 감소, 공격력·속도 대폭 증가', B([['abreak', 0.3], ['atkUp', 0.6], ['spdUp', 0.6]], 2)],
  14340: ['자기희생', '1턴 동안 충전 상태: 다음 스킬 대미지 증가, 방어력 감소', B([['next', 0.5], ['abreak', 0.3]], 1)],
  14442: ['지하의 은총', '지하의 은총 1중첩(대미지 증가, 최대 10중첩, 해제 불가)', B([['boon', 0.05, 10]], 0, { nd: 1 })],
  // defensive stances: immobile, Block Rate greatly up, a counter on each blocked technique hit
  14042: ['방패 요새', '1턴 동안 방어 자세(해제 불가): 이동 불가, 막기율 대폭 증가. 전투 스킬 공격을 막을 때마다 공격자에게 물리 대미지 1회', B([['immob'], ['blockUp', 0.6], ['blockCtr', 'phy']], 1, { nd: 1 })],
  14187: ['화염 방패 태세', '1턴 동안 방어 자세(해제 불가): 이동 불가, 막기율 대폭 증가. 전투 스킬 공격을 막을 때마다 공격자에게 불 원소 대미지 1회', B([['immob'], ['blockUp', 0.6], ['blockCtr', 'fire']], 1, { nd: 1 })],
  // ally buffs (+20% ATK of each ally's own ATK, estimated)
  14181: ['고무', '2턴 동안 2칸 내 모든 아군의 공격력 증가', ALLY_ATK(2)],
  14249: ['고무', '2턴 동안 2칸 내 모든 아군의 공격력 증가', ALLY_ATK(2)],
  14337: ['고무', '2턴 동안 2칸 내 모든 아군의 공격력 증가', ALLY_ATK(2)],
  14148: ['요괴의 힘', '2턴 동안 2칸 내 모든 아군의 공격력 증가', ALLY_ATK(2)],
  14413: ['주술: 공허', '2턴 동안 3칸 내 모든 아군의 공격력 증가, 현재 생명 일부를 실드로 전환', { k: 'voidShield', to: 'allies', r: 3, t: 2, atk: 0.2, v: 0.2, est: 1 }],
  // heals (share of the caster's max HP, estimated) and Hydration (healing over time)
  14257: ['빠른 회복', '자신을 1회 치유', { k: 'heal', v: 0.15, est: 1 }],
  14379: ['활력 회복', '1칸 내 모든 아군을 1회 치유', { k: 'heal', to: 'allies', r: 1, v: 0.1, est: 1 }],
  14723: ['불꽃', '5칸 내 모든 아군(자신 제외)을 1회 치유', { k: 'heal', to: 'allies', r: 5, ex: 1, v: 0.1, est: 1 }],
  14415: ['자연의 각성', '1칸 내 모든 아군을 1회 치유하고 2턴 동안 공격력 증가', { k: 'heal', to: 'allies', r: 1, v: 0.1, st: [['atkUp', 0.2]], t: 2, est: 1 }],
  14392: ['수분 보충', '3턴 동안 턴 시작마다 자신을 1회 치유(해제 가능). 전투 시작 시 즉시 1회 발동', { k: 'hot', v: 0.05, t: 3, pre: 1, est: 1 }],
  // shields (share of the caster's max HP, 2 turns where the text gives none, estimated)
  14445: ['서리 방패', '자신에게 실드 부여', { k: 'shield', v: 0.15, t: 2, est: 1 }],
  14291: ['고요한 혼', '2턴 동안 자신에게 실드 부여(전투 시작 시 쿨타임 초기화)', { k: 'shield', v: 0.15, t: 2, open: 1, est: 1 }],
  14358: ['맴돌기', '2턴 동안 자신에게 실드 부여(전투 시작 시 쿨타임 초기화)', { k: 'shield', v: 0.15, t: 2, open: 1, est: 1 }],
  14374: ['얼음 방패', '4칸 내 모든 아군에게 실드 부여', { k: 'shield', to: 'allies', r: 4, v: 0.1, t: 2, est: 1 }],
  // Taowu's Rage: ATK and DEF up for the battle (cannot be dispelled), opens Earth's Shake (+20% / +20%, like the Hieromon rage)
  14352: ['격노', '구속에서 풀려나 공격력·방어력 증가(해제 불가), 「대지 진동」 사용 가능', { k: 'rage', st: [['atkUp', 0.2], ['defUp', 0.2]], est: 1 }],
  // Swordlion: Twin Blades / Greatsword stances (starts in Twin Blades; each stance opens with its Starter skill)
  14364: ['자세 전환', '쌍검·대검 자세를 바꿔 다른 스킬을 사용합니다. 바꿀 때 스킬 쿨타임 초기화', { k: 'stance', est: 1 }],
  // ground effects and delayed blasts (Damage: the mob-skill coefficient)
  14128: ['심해 폭탄', '자기 자리에 물 폭탄을 놓고 3칸 후퇴. 1턴 뒤 폭발해 2칸 내 모든 적에게 물 원소 대미지 1회', { k: 'bomb', el: 'water', r: 2, retreat: 3 }],
  14082: ['사냥꾼의 덫', '전방 3×3칸 중 무작위 1칸에 거미줄(3턴). 거미줄 위의 적에게 물 원소 대미지 1회, 20% 기본 확률로 1턴 속박', { k: 'web', el: 'water', life: 3, eff: [{ k: 'immob', p: 0.2, t: 1 }] }],
  14343: ['들불', '자신 주변 1칸에 작열을 남기고 3칸 후퇴(작열 2턴 · 불 원소 대미지 1회, 지속 턴은 추정)', { k: 'burn', el: 'fire', r: 1, life: 2, retreat: 3, est: 1 }],
  14873: ['영원한 고요', '3턴 동안 유령 바다: 3칸 내 적은 자기 턴 시작마다 어둠 원소 대미지 1회, 100% 기본 확률로 1턴 유령 닻(속박으로 처리)', { k: 'aura', el: 'dark', r: 3, t: 3, eff: { k: 'immob', p: 1 } }],
  // summons: the summoned monster at the caster's level and rank (its stats are our assumption)
  14214: ['물고기 병사 소환', '자신 옆에 물고기 병사 2마리 소환(최대 5턴)', { k: 'summon', mob: 'Fishling', n: 2, life: 5, est: 1 }],
  14386: ['번개 정령 소환', '자신 옆에 번개 정령 2마리 소환(지속 턴은 추정 5턴)', { k: 'summon', mob: 'Thunderling', n: 2, life: 5, est: 1 }],
  14370: ['명령: 소환', '자신 주변 무작위 위치에 인형 4마리 소환(최대 5턴)', { k: 'summon', mob: 'Dusty Puppet', n: 4, life: 5, around: 2, est: 1 }],
  14264: ['여우 분신', '1턴 동안 여우 정령 분신 2마리 소환(공격받을 수 있고 이동·공격 불가). 분신이 사라지면 1칸 내 모든 적에게 어둠 원소 대미지 1회. 전투당 최대 2회', { k: 'clone', mob: 'Fox Spirit', n: 2, life: 1, el: 'dark', r: 1, max: 2, est: 1 }],
  14721: ['급속 부화', '전방에 혼돈 상어 2마리 소환(최대 3턴)', { k: 'none', why: '소환되는 혼돈 상어의 자료 없음' }],
  14722: ['완전 부화', '소환물이 6마리 미만이면 혼돈 졸개 2마리 소환(최대 3턴)', { k: 'none', why: '소환되는 혼돈 졸개의 자료 없음' }],
};
