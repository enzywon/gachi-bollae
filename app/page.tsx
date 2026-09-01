"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import RatingSheet, { type RatingSheetValues } from "./_components/RatingSheet";
import { CONTENTS, MOODS, TASTES, contentKeyOf, type DemoContent } from "./_data/contents";
import { createRecord, fetchCatalog } from "./_lib/client";
import { buildRecommendationPool } from "./_lib/recommendation-pool";

type Person = "me" | "partner";
type ChoiceMap = Record<Person, number[]>;
type Preference = { mood: string; genres: string[] };
type PreferenceMap = Record<Person, Preference>;
type Screen = "intro" | "preference" | "pick" | "match";

const PEOPLE: Record<Person, { name: string; initial: string }> = {
  me: { name: "나", initial: "나" },
  partner: { name: "함께 보는 사람", initial: "함" },
};

const DEMO_MATCH_POOL = CONTENTS.filter(
  (item) => item.runtime <= 60 && !item.avoid.includes("잔인함·고어"),
);
const RECENT_MATCH_IDS_KEY = "gachi-bollae:recent-match-ids";

function newRecommendationSeed() {
  return crypto.getRandomValues(new Uint32Array(1))[0];
}

function storedRecentContentIds() {
  if (typeof window === "undefined") return [];
  try {
    const stored = JSON.parse(sessionStorage.getItem(RECENT_MATCH_IDS_KEY) ?? "[]");
    return Array.isArray(stored) ? stored.filter(Number.isInteger).slice(0, 40) : [];
  } catch {
    sessionStorage.removeItem(RECENT_MATCH_IDS_KEY);
    return [];
  }
}

function reasonFor(item: DemoContent) {
  if (item.tags.includes("코미디")) return "가볍게 웃기 좋은 코미디";
  if (item.tags.includes("추리")) return "대화하며 보기 좋은 추리";
  return "함께 보기 부담 없는 분위기";
}

function preferenceReasonFor(item: DemoContent, preferences: PreferenceMap) {
  const selectedMoods = [...new Set([preferences.me.mood, preferences.partner.mood].filter(Boolean))];
  const matchedMood = selectedMoods.find((mood) => item.moods.includes(mood));
  if (matchedMood) return `오늘 고른 ‘${matchedMood}’ 분위기와 잘 맞아요`;

  const selectedGenres = [...new Set([...preferences.me.genres, ...preferences.partner.genres])];
  const matchedGenre = selectedGenres.find((genre) => item.tags.includes(genre));
  return matchedGenre ? `오늘 고른 ${matchedGenre} 취향을 반영했어요` : reasonFor(item);
}

function recommendationReasons(item: DemoContent, mutual: boolean, preferences: PreferenceMap) {
  return [
    mutual ? "두 사람 모두 직접 고른 공통 후보" : "두 사람의 선택과 가장 가까운 후보",
    preferenceReasonFor(item, preferences),
    `${item.runtime}분 안에 부담 없이 시청 가능`,
    item.safetyKnown ? "피하고 싶은 요소를 확인한 후보" : "상세 등급은 시청 전에 확인 필요",
  ];
}

export default function Home() {
  const [screen, setScreen] = useState<Screen>("intro");
  const [person, setPerson] = useState<Person>("me");
  const [index, setIndex] = useState(0);
  const [matchIndex, setMatchIndex] = useState(0);
  const [choices, setChoices] = useState<ChoiceMap>({ me: [], partner: [] });
  const [preferences, setPreferences] = useState<PreferenceMap>({
    me: { mood: "", genres: [] },
    partner: { mood: "", genres: [] },
  });
  const [sheetTarget, setSheetTarget] = useState<DemoContent | null>(null);
  const [sheetSubmitting, setSheetSubmitting] = useState(false);
  const [sheetError, setSheetError] = useState<string | null>(null);
  const [savedTitle, setSavedTitle] = useState("");
  const [contents, setContents] = useState<DemoContent[]>(CONTENTS);
  const [catalogSource, setCatalogSource] = useState<"demo" | "tmdb">("demo");
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [recommendationSeed, setRecommendationSeed] = useState(0);
  const [recentContentIds, setRecentContentIds] = useState<number[]>(storedRecentContentIds);

  const matchPool = useMemo(() => {
    const eligible = contents.filter((item) => item.runtime <= 60);
    const source = eligible.length >= 3 ? eligible : DEMO_MATCH_POOL;
    const selectedMoods = [preferences.me.mood, preferences.partner.mood].filter(Boolean);
    const selectedGenres = [...preferences.me.genres, ...preferences.partner.genres];
    return buildRecommendationPool({
      candidates: source,
      selectedMoods,
      selectedGenres,
      recentIds: recentContentIds,
      seed: recommendationSeed,
      limit: 8,
    }) as DemoContent[];
  }, [contents, preferences, recentContentIds, recommendationSeed]);

  const current = matchPool[index];
  const matches = useMemo(
    () => matchPool.filter((item) => choices.me.includes(item.id) && choices.partner.includes(item.id)),
    [choices, matchPool],
  );
  const nearbyMatches = useMemo(() => {
    const selectedIds = new Set([...choices.me, ...choices.partner]);

    return matchPool
      .filter((item) => !selectedIds.has(item.id))
      .slice(0, 3);
  }, [choices, matchPool]);
  const resultPool = matches.length > 0 ? matches : nearbyMatches;
  const winner = resultPool[matchIndex % Math.max(resultPool.length, 1)];
  const isMutual = matches.length > 0;

  useEffect(() => {
    let active = true;

    fetchCatalog()
      .then((catalog) => {
        if (!active) return;
        const eligible = catalog.contents.filter((item) => item.runtime <= 60);
        if (eligible.length >= 3) {
          setContents(catalog.contents);
          setCatalogSource(catalog.source);
        }
      })
      .catch(() => undefined)
      .finally(() => {
        if (active) setCatalogLoading(false);
      });

    return () => { active = false; };
  }, []);

  const rememberMatchPool = () => {
    const recent = storedRecentContentIds();
    const currentIds = matchPool.map((item) => item.id);
    const next = [...currentIds, ...recent.filter((id) => !currentIds.includes(id))].slice(0, 40);
    sessionStorage.setItem(RECENT_MATCH_IDS_KEY, JSON.stringify(next));
    return next;
  };

  const reset = () => {
    setScreen("intro");
    setPerson("me");
    setIndex(0);
    setMatchIndex(0);
    setChoices({ me: [], partner: [] });
    setPreferences({ me: { mood: "", genres: [] }, partner: { mood: "", genres: [] } });
    setSheetTarget(null);
    setSheetError(null);
    setSavedTitle("");
  };

  const start = () => {
    setChoices({ me: [], partner: [] });
    setPreferences({ me: { mood: "", genres: [] }, partner: { mood: "", genres: [] } });
    setPerson("me");
    setIndex(0);
    setMatchIndex(0);
    setSavedTitle("");
    setRecentContentIds(storedRecentContentIds());
    setRecommendationSeed(newRecommendationSeed());
    setScreen("preference");
  };

  const setMood = (mood: string) => {
    setPreferences((value) => ({ ...value, [person]: { ...value[person], mood } }));
  };

  const toggleGenre = (genre: string) => {
    setPreferences((value) => {
      const selected = value[person].genres;
      const genres = selected.includes(genre)
        ? selected.filter((item) => item !== genre)
        : selected.length < 2 ? [...selected, genre] : selected;
      return { ...value, [person]: { ...value[person], genres } };
    });
  };

  const submitPreference = () => {
    if (!preferences[person].mood || preferences[person].genres.length === 0) return;
    if (person === "me") {
      setPerson("partner");
      return;
    }
    setPerson("me");
    setIndex(0);
    setScreen("pick");
  };

  const retryPreferences = () => {
    const recent = rememberMatchPool();
    setChoices({ me: [], partner: [] });
    setPreferences({ me: { mood: "", genres: [] }, partner: { mood: "", genres: [] } });
    setPerson("me");
    setIndex(0);
    setMatchIndex(0);
    setRecentContentIds(recent);
    setRecommendationSeed(newRecommendationSeed());
    setScreen("preference");
  };

  const choose = (liked: boolean) => {
    if (!current) return;

    const nextChoices = liked
      ? { ...choices, [person]: [...choices[person], current.id] }
      : choices;
    setChoices(nextChoices);

    if (index < matchPool.length - 1) {
      setIndex((value) => value + 1);
      return;
    }

    if (person === "me") {
      setPerson("partner");
      setIndex(0);
      return;
    }

    rememberMatchPool();
    setScreen("match");
  };

  const submitRecord = async (values: RatingSheetValues) => {
    if (!sheetTarget) return;

    setSheetSubmitting(true);
    setSheetError(null);

    try {
      await createRecord(
        {
          contentKey: contentKeyOf(sheetTarget),
          contentTitle: sheetTarget.title,
          contentFormat: sheetTarget.format,
          contentProvider: sheetTarget.provider,
          contentRuntime: sheetTarget.runtime,
          posterPalette: sheetTarget.palette,
        },
        { watchMode: "together", pickedContext: "함께 고르기", pickedMood: [...new Set([preferences.me.mood, preferences.partner.mood])].join(" · ") },
        values,
      );
      setSavedTitle(sheetTarget.title);
      setSheetTarget(null);
    } catch (error) {
      setSheetError(error instanceof Error ? error.message : "저장에 실패했습니다.");
    } finally {
      setSheetSubmitting(false);
    }
  };

  return (
    <main className="match-app">
      <header className="match-header">
        <button className="match-brand" type="button" onClick={reset}>
          <span aria-hidden="true">●</span> 같이볼래
        </button>
        <Link className="match-history" href="/records">함께 본 목록</Link>
      </header>

      {screen === "intro" && (
        <section className="match-intro">
          <div className="match-kicker">둘이 함께 고르기</div>
          <h1>각자 고르고,<br /><em>겹치는 선택만 확인해요.</em></h1>
          <p>서로의 선택을 미리 보지 않고, 둘 다 보고 싶은 콘텐츠만 찾아요.</p>

          <div className="match-room-card">
            <div className="match-room-top"><span>오늘의 선택 세션</span><b>2명 참여</b></div>
            <div className="match-people">
              <div><i className="avatar me">나</i><strong>나</strong><small>준비 완료</small></div>
              <span className="match-link" aria-hidden="true">＋</span>
              <div><i className="avatar partner">함</i><strong>함께 보는 사람</strong><small>준비 완료</small></div>
            </div>
            <div className="match-tonight">
              <span>🍽 식사 중</span><span>⏱ 60분 이내</span><span>{catalogSource === "tmdb" ? "TMDB 인기 콘텐츠" : "추천 데모"}</span>
            </div>
            <button className="match-primary" type="button" onClick={start} disabled={catalogLoading}>
              {catalogLoading ? "오늘의 후보 불러오는 중" : "오늘 취향부터 고르기"} <span>{catalogLoading ? "…" : "→"}</span>
            </button>
            <p className="match-privacy">각자의 응답은 선택이 겹쳤을 때만 공개됩니다</p>
          </div>

          <div className="match-how" aria-label="함께 고르기 순서">
            <span><b>01</b>오늘 취향</span><span><b>02</b>각자 선택</span><span><b>03</b>함께 결정</span>
          </div>
        </section>
      )}

      {screen === "preference" && (
        <section className="match-preference">
          <div className="picker-status">
            <div className="picker-person">
              <i className={`avatar ${person}`}>{PEOPLE[person].initial}</i>
              <span><small>오늘의 취향을 고르는 사람</small><strong>{PEOPLE[person].name}</strong></span>
            </div>
            <div className="preference-step">{person === "me" ? "1" : "2"} / 2</div>
          </div>

          {person === "partner" && <div className="picker-handoff">함께 보는 사람에게 화면을 건네주세요 · 앞선 응답은 보이지 않아요</div>}

          <div className="preference-heading">
            <span className="match-kicker">오늘은 뭐가 당기나요?</span>
            <h1>지금 보고 싶은<br />느낌을 알려주세요.</h1>
            <p>매일 달라지는 취향을 오늘의 추천에 먼저 반영해요.</p>
          </div>

          <fieldset className="preference-field">
            <legend>분위기 <small>하나만 선택</small></legend>
            <div className="preference-options mood-options">
              {MOODS.map((mood) => <button type="button" key={mood} className={preferences[person].mood === mood ? "active" : ""} aria-pressed={preferences[person].mood === mood} onClick={() => setMood(mood)}>{mood}</button>)}
            </div>
          </fieldset>

          <fieldset className="preference-field">
            <legend>장르 <small>최대 2개</small></legend>
            <div className="preference-options">
              {TASTES.map((genre) => <button type="button" key={genre} className={preferences[person].genres.includes(genre) ? "active" : ""} aria-pressed={preferences[person].genres.includes(genre)} onClick={() => toggleGenre(genre)}>{genre}</button>)}
            </div>
          </fieldset>

          <button className="match-primary" type="button" disabled={!preferences[person].mood || preferences[person].genres.length === 0} onClick={submitPreference}>
            {person === "me" ? "선택을 숨기고 화면 건네기" : "오늘의 후보 확인하기"} <span>→</span>
          </button>
          <p className="match-privacy">취향 응답도 결과의 추천 근거로만 사용돼요</p>
        </section>
      )}

      {screen === "pick" && current && (
        <section className="match-pick">
          <div className="picker-status">
            <div className="picker-person">
              <i className={`avatar ${person}`}>{PEOPLE[person].initial}</i>
              <span><small>지금 고르는 사람</small><strong>{PEOPLE[person].name}</strong></span>
            </div>
            <div className="picker-count"><strong>{index + 1}</strong> / {matchPool.length}</div>
          </div>
          <div className="picker-progress"><span style={{ width: `${((index + 1) / matchPool.length) * 100}%` }} /></div>

          {person === "partner" && index === 0 && (
            <div className="picker-handoff" role="status">
              함께 보는 사람에게 화면을 건네주세요 · 앞선 선택은 보이지 않아요
            </div>
          )}

          <article className={`match-poster ${current.palette} ${current.posterUrl ? "has-poster-image" : ""}`}>
            <div
              className={`poster-art ${current.posterUrl ? "has-image" : ""}`}
              style={current.posterUrl ? { backgroundImage: `linear-gradient(180deg, rgba(18, 24, 22, .04), rgba(18, 24, 22, .52)), url(${current.posterUrl})` } : undefined}
            >
              <span>{current.source === "tmdb" ? "TMDB PICK" : "GACHI PRESENTS"}</span>
              {!current.posterUrl && <b>{current.title.slice(0, 1)}</b>}
            </div>
            <div className="poster-copy">
              <small>{current.eyebrow}</small>
              <h1>{current.title}</h1>
              <div className="poster-meta"><span>{current.provider}</span><span>{current.runtime}분</span><span>{current.format}</span></div>
              <p>{current.synopsis}</p>
              <div className="poster-reasons"><span>✦ {preferenceReasonFor(current, preferences)}</span><span>✓ 60분 안에 시청 가능</span></div>
            </div>
          </article>

          <div className="picker-actions">
            <button type="button" className="pass" onClick={() => choose(false)}><b>—</b><span>이번엔 제외</span></button>
            <button type="button" className="like" onClick={() => choose(true)}><b>＋</b><span>보고 싶어요</span></button>
          </div>
          <p className="swipe-hint">선택 내용은 상대에게 보이지 않아요</p>
        </section>
      )}

      {screen === "match" && winner && (
        <section className="match-result">
          <div className="match-burst" aria-hidden="true">{isMutual ? "✓" : "✦"}</div>
          <div className="match-kicker">{isMutual ? "공통 후보를 찾았어요" : "선택을 바탕으로 골랐어요"}</div>
          <h1>{isMutual ? <>두 사람의 선택이<br />여기서 겹쳤어요.</> : <>다시 고르지 않아도 돼요.<br />가까운 후보를 찾았어요.</>}</h1>
          {!isMutual && <p className="match-result-lead">각자의 응답은 공개하지 않고, 두 선택에 가까운 작품부터 제안해요.</p>}
          <div className={`result-ticket ${winner.palette}`}>
            <div className="ticket-art"><span>{winner.title.slice(0, 1)}</span></div>
            <div className="ticket-copy"><small>{isMutual ? "공통 후보" : "가까운 추천"} {matchIndex + 1}</small><h2>{winner.title}</h2><p>{winner.provider} · {winner.runtime}분 · {winner.format}</p></div>
            {isMutual ? <div className="ticket-hearts"><i className="avatar me">나</i><span>＋</span><i className="avatar partner">함</i></div> : <div className="ticket-private">두 사람의 개별 선택은 계속 비공개예요</div>}
          </div>
          <div className="match-why">
            <strong>이 후보를 추천하는 이유</strong>
            {recommendationReasons(winner, isMutual, preferences).map((reason, reasonIndex) => <span key={reason}> {reasonIndex === 3 && !winner.safetyKnown ? "ⓘ" : "✓"} {reason}</span>)}
          </div>
          <button type="button" className="match-primary" onClick={() => setSheetTarget(winner)}>
            이 콘텐츠로 결정 <span>→</span>
          </button>
          {resultPool.length > 1 && (
            <button type="button" className="match-again" onClick={() => setMatchIndex((value) => (value + 1) % resultPool.length)}>
              다른 {isMutual ? "공통" : "추천"} 후보 보기
            </button>
          )}
          <p className="match-count">{isMutual ? `공통 후보 ${matches.length}개 · 두 사람의 선택이 겹친 순서예요` : `추천 후보 ${resultPool.length}개 · 선택과 가까운 순서예요`}</p>
          {catalogSource === "tmdb" && <p className="match-source">콘텐츠 정보와 포스터는 TMDB에서 제공받습니다.</p>}
          {savedTitle && (
            <div className="save-toast" role="status">
              <span>✓</span><p>“{savedTitle}”을 함께 본 목록에 저장했어요.</p><Link href="/records">목록 보기</Link>
            </div>
          )}
        </section>
      )}

      {screen === "match" && !winner && (
        <section className="match-result">
          <div className="match-burst" aria-hidden="true">✦</div>
          <div className="match-kicker">개별 선택은 그대로 지켰어요</div>
          <h1>오늘 후보 안에서는<br />새 추천을 만들기 어려워요.</h1>
          <p className="match-result-lead">누가 무엇을 골랐는지 드러내지 않기 위해, 개별 선택 작품은 추천 후보에서 제외했어요.</p>
          <button type="button" className="match-primary" onClick={retryPreferences}>오늘 취향 다시 맞추기 <span>→</span></button>
        </section>
      )}

      {sheetTarget && (
        <RatingSheet
          title={sheetTarget.title}
          format={sheetTarget.format}
          submitting={sheetSubmitting}
          error={sheetError}
          submitLabel="함께 본 목록에 저장"
          onSubmit={submitRecord}
          onClose={() => {
            setSheetTarget(null);
            setSheetError(null);
          }}
        />
      )}
    </main>
  );
}
