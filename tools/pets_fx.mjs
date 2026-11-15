// Fantomon (판타몬) skills: Korean names/descriptions + battle models, keyed by the English pet and skill names on
// purrwikimania /pets. build_extra.mjs merges these into the parsed data (rank-scaled numbers still come from the page).
// No official Korean text for Fantomon skills was found, so names/descriptions are translations in client terms.
//
// sup  — support skill overrides (merged into the parsed support skill)
//   eff[].max   stacking debuff (stacks add up to max)      big        +x DMG to large targets
//   effAdult    the adult form's own copy of the effect      cleanse    chance to dispel 1 debuff (healLow)
//   k:'allyHeal' heal 1 target when the owner casts a technique on allies
//   k:'ga'      Guardian Angel → heal 50% lost HP after 3 turns + Power Unsealed (crit/accuracy) for the battle
//   k:'nap'     Sleep stacks → Pava at 7 (estimate: ATK/DEF up)   k:'purity'  Purity = DMG taken down (estimate)
//   defStk      Armor Protection: DEF Up stacks before the shield
// sk   — materialized skills by English name: model fields are merged over the parsed skill
//   kind:'shield'|'buff' (+ bvKey: data key for the value), tg:{t:'owner'|'self'|...}, sp:{...}, zi: no initial CD,
//   rbuff: random +x ATK/DEF/SPD buff after a heal, purity: grant Purity, eff: [...]
// pv   — passives (adult only): k = killSplash | dmgRedTaunt | healUp | regenAllies | phantom
// no   — parts of the text the simulator does not model (shown with ⚠)
const T = (ko, d, o = {}) => ({ ko, d, ...o });

export const PFX = {
  Falko: {
    sup: T('황금 섬광', '대미지 전투 스킬을 적에게 사용하면 대상 중 1명과 그 주변 1칸 내 모든 적에게 물리 대미지를 1회 줍니다.'),
    sk: {
      'Golden Feather': T('황금 깃털', '4칸 내 적 1명에게 물리 대미지를 1회 줍니다.'),
      'Golden Storm': T('황금 폭풍', '4칸 내 위치를 골라 주변 1칸 정사각형 범위의 모든 적에게 물리 대미지를 3회 줍니다.'),
    },
  },
  Boaro: {
    sup: T('산의 가호', '최대 생명력의 15%를 누적으로 잃을 때마다 방어력 기반 실드를 얻습니다. 전투당 최대 5회.'),
    sk: {
      Crash: T('박치기', '1칸 내 적 1명에게 물리 대미지를 1회 줍니다.'),
      'Mountain Charge': T('산악 돌진', '1칸 내 적 1명에게 물리 대미지를 1회 주고, 100% 기본 확률로 1칸 넉백시킵니다.', { no: ['넉백'] }),
    },
  },
  Mandragora: {
    sup: T('자연의 힘', '캐릭터가 아군에게 전투 스킬을 사용하면 대상 1명을 1회 치유합니다.', { k: 'allyHeal' }),
    sk: {
      'Flying Leaf': T('나뭇잎 날리기', '4칸 내 적 1명에게 바람 원소 대미지를 1회 줍니다.'),
      'Wakening of Vitality': T('생명의 각성', '4칸 내 아군 1명(자신 제외)을 1회 치유합니다.'),
    },
  },
  Zeioletus: {
    sup: T('연화보', '대미지 전투 스킬을 적에게 사용하면 대상 중 1명과 그 주변 1칸 내 모든 적에게 빛 원소 대미지를 1회 주고 에어본시킵니다. 2턴마다 최대 2회. (대형 대상에게 대미지 20% 증가)', { big: 0.2, no: ['에어본'] }),
    sk: {
      'Aura Shot': T('오라 샷', '4칸 내 적 1명에게 빛 원소 대미지를 1회 줍니다. (대형 대상에게 대미지 20% 증가)', { big: 0.2 }),
      'Bolt from the Blue': T('청천벽력', '6칸 내 위치를 골라 주변 1칸 정사각형 범위의 모든 적에게 빛 원소 대미지를 1회 주고 에어본시킵니다. (대형 대상에게 대미지 20% 증가)', { big: 0.2, no: ['에어본'] }),
    },
  },
  Terragon: {
    sup: T('사암 탄환', '대미지 전투 스킬을 적에게 사용하면 대상 중 1명에게 물리 대미지를 1회 주고, 50% 기본 확률로 1턴 동안 공격력을 25% 감소시킵니다(성년은 18%). 턴당 1회.'),
    sk: {
      'Tail Lash': T('꼬리 치기', '1칸 내 적 1명에게 물리 대미지를 1회 줍니다.'),
      'Falling Sand': T('모래 낙하', '전방 3×2칸 범위의 모든 적에게 물리 대미지를 1회 주고, 50% 기본 확률로 2턴 동안 주는 대미지를 15% 감소시킵니다.'),
    },
  },
  Sylvaerie: {
    sup: T('바람의 포옹', '캐릭터의 턴이 끝나면 1턴 동안 캐릭터의 공격력과 속도가 증가합니다.'),
    sk: {
      'Glow Glob': T('빛망울', '4칸 내 적 1명에게 바람 원소 대미지를 1회 줍니다.'),
      'Slow Wind Shot': T('느린 바람 탄', '4칸 내 적 1명에게 바람 원소 대미지를 1회 주고, 60% 기본 확률로 대상의 행동을 15% 지연시킵니다.', { eff: [{ k: 'delay', v: 0.15, p: 0.6 }] }),
    },
  },
  Kels: {
    sup: T('정화 주문', '대미지 전투 스킬을 적에게 사용하면 대상 중 1명에게 물 원소 대미지를 1회 주고 버프 1개를 무작위로 해제합니다. 턴당 1회.'),
    sk: {
      'Water Orb': T('물 구슬', '4칸 내 적 1명에게 물 원소 대미지를 1회 줍니다.'),
      'Water Drill': T('워터 드릴', '전방 1×4칸 범위의 모든 적에게 물 원소 대미지를 1회 주고, 50% 기본 확률로 2턴 동안 방어력을 20% 감소시킵니다.'),
    },
  },
  Armopi: {
    sup: T('갑주 수호', '캐릭터의 턴이 끝날 때 방어력 증가 1중첩을 얻습니다. 3중첩이 되면 모두 없애고 방어력 기반 실드를 얻습니다.', { defStk: 1 }),
    sk: {
      Dash: T('돌진', '1칸 내 적 1명에게 물리 대미지를 1회 줍니다.'),
      'Heavy Protection': T('중장 수호', '2칸 내 주인에게 판타몬 방어력 기반 실드를 2턴 동안 부여합니다.', { kind: 'shield', tg: { t: 'owner', r: 2 }, bvKey: 'ST:ShieldByDefence', shT: 2 }),
    },
  },
  Herbote: {
    sup: T('응급 처치', '캐릭터가 생명력 80% 미만으로 턴을 시작하면 1회 치유하고, 50% 확률로 이상 상태·디버프 1개를 무작위로 해제합니다.', { cleanse: 0.5 }),
    sk: {
      'Quick Fix': T('신속 치료', '2칸 내 아군 1명을 1회 치유합니다.', { tg: { t: 'allyLow', r: 2 } }),
      'Cure All': T('만병통치', '2칸 내 주인을 1회 치유하고, 1턴 동안 무작위 버프 1개(공격력·방어력·속도 +10%)를 부여합니다.', { tg: { t: 'owner', r: 2 }, rbuff: 0.1 }),
    },
  },
  Nyxarchon: {
    sup: T('레퀴엠 블라스트', '대미지 전투 스킬을 적에게 사용하면 대상 중 1명과 그 주변 2칸 내 모든 적에게 어둠 원소 대미지를 1회 주고, 100% 확률로 2턴 동안 방어력 10% 감소 1중첩(최대 3중첩)을 부여합니다. 2턴마다 최대 2회. (대형 대상은 여러 번 맞을 수 있음)',
      { eff: [{ k: 'abreak', v: 0.1, p: 1, t: 2, max: 3 }] }),
    sk: {
      'Shadow Sweep': T('그림자 휩쓸기', '전방 3×2칸 범위의 모든 적에게 어둠 원소 대미지를 1회 줍니다.'),
      'Nightshade Blast': T('나이트셰이드 블라스트', '2칸 내 적 1명에게 어둠 원소 대미지를 1회 줍니다. 대상이 잃은 생명력 5%마다 이 스킬의 대미지가 5% 증가합니다(최대 50%). 실체화하면 쿨다운이 초기화됩니다.',
        { sp: { k: 'execute', step: 0.05, max: 0.5 }, zi: 1 }),
    },
    pv: { 'Death Star Scatter': T('사성 산개', '적을 처치하면 대상 2칸 내 모든 적에게 어둠 원소 대미지를 1회 줍니다.', { k: 'killSplash', el: 'dark', ar: 2 }) },
  },
  Aegiswing: {
    sup: T('빛의 성역', '전투 시작 시 캐릭터에게 3턴 동안 수호천사를 부여합니다. 수호천사가 끝나면 잃은 생명력의 50%를 회복하고, 전투 내내 봉인 해제(치명타율·명중 증가)를 얻습니다.',
      { k: 'ga', no: ['수호천사 지속 중 효과'] }),
    sk: {
      'Radiant Halo': T('광휘의 고리', '3칸 내 위치를 골라 주변 1칸 정사각형 범위의 모든 적에게 빛 원소 대미지를 1회 주고, 50% 기본 확률로 2턴 동안 도발합니다.'),
      'Divine Retribution': T('신성한 응징', '3칸 내 위치를 골라 주변 1칸 정사각형 범위의 모든 적에게 빛 원소 대미지를 1회 주고, 50% 기본 확률로 2턴 동안 응징을 부여합니다.', { no: ['응징'] }),
    },
    pv: { 'Bright Conviction': T('빛의 신념', '도발된 적에게서 받는 대미지가 감소합니다.', { k: 'dmgRedTaunt', key: 'ST:StatusDmgReducePer' }) },
  },
  Pandarial: {
    sup: T('먹물 폭발', '전투 시작 시 캐릭터의 모든 전투 스킬 쿨다운을 1턴 줄이고, 전투 내내 대미지 보너스를 부여합니다.'),
    sk: {
      'Bamboo Gale': T('대나무 돌풍', '4칸 내 적 1명에게 물리 대미지를 1회 주며, 50% 확률로 1.5배 대미지를 줍니다.', { sp: { k: 'lucky', p: 0.5, m: 1.5 } }),
      'Verdant Spikes': T('신록 가시', '4칸 내 대상을 골라 주변 1칸 정사각형 범위의 모든 적에게 물리 대미지를 1회 주고, 100% 기본 확률로 1턴 동안 취약을 부여합니다.'),
    },
    pv: { 'Emerald Dew': T('비취 이슬', '턴 시작 시 4칸 내 아군을 1회 치유합니다.', { k: 'regenAllies', r: 4 }) },
  },
  Chomusuke: {
    sup: T('그냥 고양이?', '캐릭터가 대미지 전투 스킬을 적에게 사용하면 맞은 대상 주변 1칸 내 모든 적에게 물리 대미지를 1회 주고, 50% 기본 확률로 1턴 동안 방어력을 15% 감소시킵니다. 턴당 1회.'),
  },
  'Cabbage Dog': {
    sup: T('그냥 낮잠', '캐릭터의 턴이 끝날 때 수면 1중첩을 얻습니다(최대 7, 해제 불가). 7중첩이 되면 모두 없애고 파바(해제 불가)를 얻습니다.', { k: 'nap', est: 1 }),
    sk: {
      Breather: T('한숨 돌리기', '자신을 1회 치유합니다.', { tg: { t: 'self' } }),
      'Golden Cabbage Strike': T('황금 양배추 강타', '3칸 내 모든 적에게 물리 대미지를 1회 주고, 50% 확률로 1턴 동안 도발합니다. 실체화하면 쿨다운이 초기화됩니다.', { zi: 1 }),
    },
  },
  Prismora: {
    sup: T('맑은 마음', '전투 시작 시 캐릭터에게 순수를 부여합니다. 치유·버프 전투 스킬을 쓸 때마다 프리즘 광채 1중첩(최대 4)을 얻고, 4중첩이 되면 전투당 1회 맑은 마음을 얻습니다.',
      { k: 'purity', est: 1, no: ['프리즘 광채 · 맑은 마음'] }),
    sk: {
      'Crystal Energy': T('수정 에너지', '4칸 내 아군 1명을 1회 치유하고 순수를 부여합니다.', { purity: 1 }),
      'Prismatic Flow': T('프리즘 흐름', '4칸 내 아군 1명을 1회 치유하고, 대상 4칸 내 무작위 아군에게 최대 3회 이어서 치유합니다.', { sp: { k: 'healChain', n: 3, decay: 0 } }),
    },
    pv: { 'Purity Power': T('순수의 힘', '실체화한 판타몬의 치유 효과가 증가합니다.', { k: 'healUp', key: 'ST:CureAddPercent' }) },
  },
  'Luminarch Steed': {
    sup: T('세월의 구름', '전투 시작 시 3턴 동안 받는 대미지가 감소하고(해제 불가), 전투 내내 캐릭터의 막기율이 증가합니다(해제 불가).'),
    sk: {
      'Cloudstep Hoof': T('구름 발굽', '주변 1칸 정사각형 범위의 모든 적에게 물리 대미지를 1회 줍니다.'),
      'Luminous Ward': T('광휘의 수호', '3칸 내 모든 아군이 받는 대미지를 1턴 동안 감소시킵니다. (첫 쿨다운 없음)',
        { kind: 'buff', buff: { st: 'dmgRed', to: 'allies', r: 3, t: 1 }, bvKey: 'ST:StatusDmgReducePer', zi: 1 }),
    },
  },
  Yoldra: {
    sup: T('빙폭', '이미르의 공격을 도와 적 1명과 그 주변 1칸 내 모든 적에게 물 원소 대미지를 1회 줍니다. 턴당 1회.'),
  },
  Hexitty: {
    sup: T('자라나는 도깨비불', '캐릭터의 턴이 끝날 때 8칸 내 가장 가까운 적에게 불 원소 대미지를 1회 주고 도깨비불 성장 1중첩(최대 10)을 얻습니다. 4중첩이 되면 캐릭터가 해제 불가 대미지 보너스를 얻습니다.'),
    sk: {
      'Impish Ghostfire': T('장난꾸러기 도깨비불', '4칸 내 적 1명에게 불 원소 대미지를 1회 준 뒤, 그 대상 4칸 내 무작위 적에게 최대 7회 튕깁니다. (대형 대상은 여러 번 맞을 수 있음)', { sp: { k: 'bounce', n: 7, r: 4 } }),
      'Wraithfire Haunt': T('망령불 출몰', '자신과 주인 3칸 내 모든 적에게 불 원소 대미지를 1회 주고, 50% 확률로 범위 칸에 작열을 남깁니다. (실체화당 1회)', { eff: [{ k: 'dot', p: 0.5, t: 3, el: 'fire' }], no: ['작열 지대(대상에게 거는 작열로 근사)'] }),
    },
    pv: { 'Evanescent Phantom': T('덧없는 환영', '실체화에 필요한 에너지가 크게 줄지만 3턴만 전장에 머뭅니다. 쓰러지거나 사라질 때 3칸 내 모든 적에게 불 원소 대미지를 1회 주고, 100% 기본 확률로 2턴 동안 방어력 감소 2를 부여합니다.',
      { k: 'phantom', life: 3, r: 3, el: 'fire', eff: [{ k: 'abreak', v: 0.3, p: 1, t: 2 }] }) },
  },
  Mumpkin: {
    sup: T('붕대와 호박', '캐릭터가 대미지 전투 스킬을 적에게 사용하면 대상 중 1명과 그 주변 1칸 내 모든 적에게 물리 대미지를 주고 캐릭터를 1회 치유합니다. 2턴마다 최대 2회.'),
    sk: {
      'Soulbreak Impact': T('영혼 파쇄', '1칸 내 적 1명에게 물리 대미지를 1회 줍니다.'),
      'Grave Lament': T('무덤의 비가', '2칸 내 모든 적에게 물리 대미지를 1회 주고, 80% 기본 확률로 1턴 동안 혈원을 부여합니다.', { no: ['혈원'] }),
    },
  },
};
