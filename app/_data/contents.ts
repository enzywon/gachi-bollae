import type { ContentFormat } from "../_lib/types";

export type DemoContent = {
  id: number;
  title: string;
  eyebrow: string;
  runtime: number;
  format: ContentFormat;
  provider: string;
  synopsis: string;
  tags: string[];
  avoid: string[];
  contexts: string[];
  moods: string[];
  palette: string;
};

export const CONTEXTS = [
  { value: "식사 중", icon: "🍽️", hint: "불편한 장면 없이 편하게" },
  { value: "자기 전", icon: "🌙", hint: "부담 없이 한 편만" },
  { value: "집중해서 보기", icon: "🔎", hint: "놓치지 않고 몰입해서" },
  { value: "편하게 보기", icon: "🛋️", hint: "대화하며 가볍게" },
];

export const MOODS = ["웃고 싶어요", "긴장감", "따뜻함", "감동", "몰입"];
export const TASTES = ["추리", "코미디", "드라마", "예능", "SF", "로맨스"];
export const AVOIDS = ["잔인함·고어", "공포·깜짝", "선정적인 장면", "불쾌한 소재", "무거운 분위기"];
export const PROVIDERS = ["Netflix", "TVING", "Disney+", "Coupang Play", "상관없음"];

export const CONTENTS: DemoContent[] = [
  {
    id: 1,
    title: "한밤의 레시피",
    eyebrow: "편안한 푸드 예능",
    runtime: 28,
    format: "예능",
    provider: "Netflix",
    synopsis: "서로 다른 두 사람이 한 끼를 완성하며 나누는 소소하고 유쾌한 이야기.",
    tags: ["예능", "코미디"],
    avoid: [],
    contexts: ["식사 중", "자기 전", "편하게 보기"],
    moods: ["웃고 싶어요", "따뜻함"],
    palette: "poster-plum",
  },
  {
    id: 2,
    title: "사라진 초대장",
    eyebrow: "가볍게 풀어가는 미스터리",
    runtime: 52,
    format: "시리즈",
    provider: "TVING",
    synopsis: "오래된 호텔에 모인 여섯 명과 주인 없는 초대장. 대화하며 추리하기 좋은 미스터리.",
    tags: ["추리", "드라마"],
    avoid: [],
    contexts: ["집중해서 보기", "편하게 보기"],
    moods: ["긴장감", "몰입"],
    palette: "poster-blue",
  },
  {
    id: 3,
    title: "우리 동네 우주센터",
    eyebrow: "따뜻한 생활 SF",
    runtime: 44,
    format: "시리즈",
    provider: "Disney+",
    synopsis: "폐업 직전의 천문관에서 시작된 작은 신호가 평범한 이웃들의 일상을 바꾼다.",
    tags: ["SF", "코미디", "드라마"],
    avoid: [],
    contexts: ["자기 전", "편하게 보기", "집중해서 보기"],
    moods: ["따뜻함", "감동", "몰입"],
    palette: "poster-cyan",
  },
  {
    id: 4,
    title: "퇴근은 처음이라",
    eyebrow: "현실 공감 오피스 코미디",
    runtime: 32,
    format: "시리즈",
    provider: "Coupang Play",
    synopsis: "매일 다른 사건이 벌어지는 작은 회사에서 다섯 동료가 버텨내는 유쾌한 하루.",
    tags: ["코미디", "드라마"],
    avoid: [],
    contexts: ["식사 중", "자기 전", "편하게 보기"],
    moods: ["웃고 싶어요", "따뜻함"],
    palette: "poster-coral",
  },
  {
    id: 5,
    title: "마지막 목격자",
    eyebrow: "대화가 필요한 정통 추리",
    runtime: 118,
    format: "영화",
    provider: "Netflix",
    synopsis: "모든 증언이 엇갈리는 밤, 단 하나의 거짓말을 찾기 위한 두 형사의 추적이 시작된다.",
    tags: ["추리", "드라마"],
    avoid: ["무거운 분위기"],
    contexts: ["집중해서 보기"],
    moods: ["긴장감", "몰입"],
    palette: "poster-gold",
  },
  {
    id: 6,
    title: "주말의 작은 여행",
    eyebrow: "잔잔한 여행 다큐 예능",
    runtime: 47,
    format: "예능",
    provider: "TVING",
    synopsis: "멀리 가지 않아도 충분한 하루. 도시 주변의 숨은 풍경과 한 끼를 찾아간다.",
    tags: ["예능", "드라마"],
    avoid: [],
    contexts: ["식사 중", "자기 전", "편하게 보기"],
    moods: ["따뜻함", "감동"],
    palette: "poster-green",
  },
];

/**
 * 기록에 저장할 콘텐츠 식별자.
 * 외부 API를 도입하면 `tmdb:movie:12345` 형태로 확장한다. PRD 9.1.
 */
export function contentKeyOf(content: DemoContent): string {
  return `demo:${content.id}`;
}
