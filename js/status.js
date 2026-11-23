// Status names for the replay (3D chips use the short form, the live panel the full one). Korean client terms where known.
export const ST_KO = {
  abreak: '방어력 감소', weak: '공격력 감소', slow: '감속', stun: '스턴', freeze: '빙결', immob: '속박', taunt: '도발', frenzy: '광란', blind: '실명',
  cold: '냉기', wet: '습윤', dot: '지속 대미지', riven: '막기율 감소', sigil: '낙인', vuln: '취약', wither: '시듦',
  shield: '실드', defUp: '방어력 증가', atkUp: '공격력 증가', spdUp: '속도 증가', critUp: '치명타율 증가', blockUp: '막기율 증가', dmgUp: '대미지 보너스',
  dmgRed: '받는 대미지 감소', hot: '지속 치유', dodgeUp: '회피 증가', critStk: '치명타율 중첩', spdStk: '속도 중첩', hpUp: '최대 생명력 증가',
  swords: '광검 진', flame: '열화', nextAcc: '다음 스킬 명중', nextDoom: '다음 스킬 파멸', purity: '순수', ga: '수호천사', accUp: '봉인 해제(명중)',
  stealth: '잠행', voidRune: '보이드 룬', lacer: '열상', counterSt: '반격 태세',
};
export const ST_SHORT = {
  abreak: '방어↓', weak: '공격↓', slow: '감속', stun: '스턴', freeze: '빙결', immob: '속박', taunt: '도발', frenzy: '광란', blind: '실명',
  cold: '냉기', wet: '습윤', dot: '지속피해', riven: '막기↓', sigil: '낙인', vuln: '취약', wither: '시듦',
  shield: '실드', defUp: '방어↑', atkUp: '공격↑', spdUp: '속도↑', critUp: '치명↑', blockUp: '막기↑', dmgUp: '대미지↑',
  dmgRed: '피해감소', hot: '재생', dodgeUp: '회피↑', critStk: '치명중첩', spdStk: '속도중첩', hpUp: '생명↑',
  swords: '광검', flame: '열화', nextAcc: '명중강화', nextDoom: '파멸강화', purity: '순수', ga: '수호천사', accUp: '봉인해제',
  stealth: '잠행', voidRune: '룬', lacer: '열상', counterSt: '반격',
};
/** control effects are shown first, then other debuffs, then buffs */
export const ST_CONTROL = new Set(['stun', 'freeze', 'immob', 'taunt', 'frenzy']);
export const stOrder = ([k, e]) => (ST_CONTROL.has(k) ? 0 : !e.b && k !== 'shield' ? 1 : k === 'shield' ? 3 : 2);
