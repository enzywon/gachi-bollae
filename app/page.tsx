"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import RatingSheet, { type RatingSheetValues } from "./_components/RatingSheet";
import { CONTENTS, contentKeyOf, type DemoContent } from "./_data/contents";
import { createRecord, fetchCatalog } from "./_lib/client";

type Person = "me" | "partner";
type ChoiceMap = Record<Person, number[]>;
type Screen = "intro" | "pick" | "match";

const PEOPLE: Record<Person, { name: string; initial: string }> = {
  me: { name: "나", initial: "나" },
  partner: { name: "함께 보는 사람", initial: "함" },
};

const DEMO_MATCH_POOL = CONTENTS.filter(
  (item) => item.runtime <= 60 && !item.avoid.includes("잔인함·고어"),
);

function reasonFor(item: DemoContent) {
  if (item.tags.includes("코미디")) return "둘 다 좋아할 가벼운 웃음";
  if (item.tags.includes("추리")) return "대화하며 보기 좋은 추리";
  return "편안한 분위기의 공통 취향";
}

export default function Home() {
  const [screen, setScreen] = useState<Screen>("intro");
  const [person, setPerson] = useState<Person>("me");
  const [index, setIndex] = useState(0);
  const [matchIndex, setMatchIndex] = useState(0);
  const [choices, setChoices] = useState<ChoiceMap>({ me: [], partner: [] });
  const [sheetTarget, setSheetTarget] = useState<DemoContent | null>(null);
  const [sheetSubmitting, setSheetSubmitting] = useState(false);
  const [sheetError, setSheetError] = useState<string | null>(null);
  const [savedTitle, setSavedTitle] = useState("");
  const [contents, setContents] = useState<DemoContent[]>(CONTENTS);
  const [catalogSource, setCatalogSource] = useState<"demo" | "tmdb">("demo");
  const [catalogLoading, setCatalogLoading] = useState(true);

  const matchPool = useMemo(() => {
    const eligible = contents.filter((item) => item.runtime <= 60);
    return eligible.length >= 3 ? eligible : DEMO_MATCH_POOL;
  }, [contents]);

  const current = matchPool[index];
  const matches = useMemo(
    () => matchPool.filter((item) => choices.me.includes(item.id) && choices.partner.includes(item.id)),
    [choices, matchPool],
  );
  const winner = matches[matchIndex % Math.max(matches.length, 1)];

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

  const reset = () => {
    setScreen("intro");
    setPerson("me");
    setIndex(0);
    setMatchIndex(0);
    setChoices({ me: [], partner: [] });
    setSheetTarget(null);
    setSheetError(null);
    setSavedTitle("");
  };

  const start = () => {
    setChoices({ me: [], partner: [] });
    setPerson("me");
    setIndex(0);
    setMatchIndex(0);
    setSavedTitle("");
    setScreen("pick");
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
        { watchMode: "together", pickedContext: "함께 고르기", pickedMood: null },
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
              {catalogLoading ? "오늘의 후보 불러오는 중" : "각자 고르기 시작"} <span>{catalogLoading ? "…" : "→"}</span>
            </button>
            <p className="match-privacy">각자의 응답은 선택이 겹쳤을 때만 공개됩니다</p>
          </div>

          <div className="match-how" aria-label="함께 고르기 순서">
            <span><b>01</b>각자 선택</span><span><b>02</b>공통 후보 확인</span><span><b>03</b>함께 결정</span>
          </div>
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

          <article className={`match-poster ${current.palette}`}>
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
              <div className="poster-reasons"><span>✦ {reasonFor(current)}</span><span>✓ 60분 안에 시청 가능</span></div>
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
          <div className="match-burst" aria-hidden="true">✓</div>
          <div className="match-kicker">공통 후보를 찾았어요</div>
          <h1>두 사람의 선택이<br />여기서 겹쳤어요.</h1>
          <div className={`result-ticket ${winner.palette}`}>
            <div className="ticket-art"><span>{winner.title.slice(0, 1)}</span></div>
            <div className="ticket-copy"><small>공통 후보 {matchIndex + 1}</small><h2>{winner.title}</h2><p>{winner.provider} · {winner.runtime}분 · {winner.format}</p></div>
            <div className="ticket-hearts"><i className="avatar me">나</i><span>＋</span><i className="avatar partner">함</i></div>
          </div>
          <div className="match-why">
            <strong>왜 둘에게 잘 맞을까요?</strong>
            <span>✓ {reasonFor(winner)}</span><span>✓ 둘 다 직접 남긴 후보</span><span>{winner.safetyKnown ? "✓ 피하고 싶은 요소 없이 편안하게" : "ⓘ 시청 전 상세 등급을 확인해 주세요"}</span>
          </div>
          <button type="button" className="match-primary" onClick={() => setSheetTarget(winner)}>
            이 콘텐츠로 결정 <span>→</span>
          </button>
          {matches.length > 1 && (
            <button type="button" className="match-again" onClick={() => setMatchIndex((value) => (value + 1) % matches.length)}>
              다른 공통 후보 보기
            </button>
          )}
          <p className="match-count">공통 후보 {matches.length}개 · 두 사람의 선택이 겹친 순서로 보여드려요</p>
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
          <div className="match-burst" aria-hidden="true">—</div>
          <div className="match-kicker">아직 겹치는 선택이 없어요</div>
          <h1>서로의 선택은 숨긴 채<br />새 후보로 다시 골라봐요.</h1>
          <p className="match-count">결과가 없더라도 상대가 무엇을 제외했는지는 공개하지 않아요.</p>
          <button type="button" className="match-primary" onClick={start}>다시 고르기 <span>→</span></button>
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
