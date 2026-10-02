// 한능검 시대별 무료 개념 강의 — 결과 화면 "시대별 결과"에서 약한 시대 옆에 링크로 보여 준다.
// 선생님이 바꾸기 쉽도록 데이터만 둔다. 출처: YouTube 「최태성 1TV」 [심화별개념8] 재생목록(무료·로그인 불필요).
// URL에 list=를 붙여 두면 다음 강의가 이어서 재생된다. 바꿀 때는 실제로 열어 제목·채널을 확인할 것.
import type { HanneungEra } from '../ui/hanneungEra.ts';

export interface HanneungLecture {
  provider: string;
  title: string;
  url: string;
}

const PLAYLIST = 'PLE7ogCa1_I6vHV27uMB1qrGTC5tc9b6du';
const PROVIDER = '최태성 1TV (YouTube)';
const video = (id: string, title: string): HanneungLecture => ({
  provider: PROVIDER,
  title,
  url: `https://www.youtube.com/watch?v=${id}&list=${PLAYLIST}`,
});

export const HANNEUNG_LECTURES: Record<HanneungEra, HanneungLecture[]> = {
  prehistory: [video('TodOGPTr9w8', '[심화별개념8] 2강 선사 시대'), video('szjtsoNwFOM', '[심화별개념8] 3강 여러 나라의 성장')],
  'three-kingdoms': [video('ggzs03amdfc', '[심화별개념8] 4강 고대(고구려, 가야)'), video('z6vclyLRVGs', '[심화별개념8] 5강 고대(백제, 신라)')],
  'north-south': [video('UzRgnhw3F-A', '[심화별개념8] 6강 고대(통일 신라, 발해)')],
  goryeo: [video('0HthwPq694g', '[심화별개념8] 10강 고려(초기 정치)'), video('AT8yuEZlYZ0', '[심화별개념8] 11강 고려(중기 정치~무신 정변)')],
  'joseon-early': [video('ggGMXG63YCk', '[심화별개념8] 16강 조선 전기(정치)'), video('5beVYYeSjiA', '[심화별개념8] 17강 조선(조직)')],
  'joseon-late': [video('ABLKta0DALk', '[심화별개념8] 22강 조선 후기(정치)'), video('1p1U0Eavzio', '[심화별개념8] 25강 조선 후기(사회)')],
  opening: [video('1r-iIYBLGqo', '[심화별개념8] 28강 개항기(흥선 대원군)'), video('Adm2V2QHiZc', '[심화별개념8] 30강 개항기(동학 농민 운동~대한 제국)')],
  colonial: [video('XK41tgVeyA0', '[심화별개념8] 34강 일제 강점기(식민 통치)'), video('_WYW5-mATq0', '[심화별개념8] 36강 일제 강점기(1920년대 저항)')],
  modern: [video('x0HGYwHV15Q', '[심화별개념8] 38강 현대(광복~6·25 전쟁)'), video('1WsKWo__Acg', '[심화별개념8] 39강 현대(민주주의의 발전)')],
  cross: [{ provider: PROVIDER, title: '[심화별개념8] 전체 강의 목록(40강)', url: `https://www.youtube.com/playlist?list=${PLAYLIST}` }],
};
