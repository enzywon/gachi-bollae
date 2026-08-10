"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import RatingSheet, { type RatingSheetValues } from "./_components/RatingSheet";
import { CONTENTS, CONTEXTS, MOODS, contentKeyOf, type DemoContent } from "./_data/contents";
import { createRecord } from "./_lib/client";

type Mode = "solo" | "together";
type Step = "mode" | "context" | "mood" | "pick" | "result";
type Person = "me" | "other";

const MAX_CANDIDATES = 5;
const MAX_RUNTIME = 60;
const CONTEXT_POINTS = 35;
const MOOD_POINTS = 25;

function defaultsForContext(context: string) {
  if (context === "식사 중") return ["잔인함·고어", "불쾌한 소재"];
  if (context === "자기 전") return ["공포·깜짝", "무거운 분위기"];
  return [];
}

function reasonFor(content: DemoContent, context: string, mood: string) {
  if (content.contexts.includes(context)) return `${context}에 잘 맞는 구성`;
  if (content.moods.includes(mood)) return `${mood} 무드에 가까운 이야기`;
  return "부담 없이 꺼내 보기 좋은 후보";
}

export default function Home() {
  const [step, setStep] = useState<Step>("mode");
  const [mode, setMode] = useState<Mode | null>(null);
  const [context, setContext] = useState("");
  const [mood, setMood] = useState("");
  const [person, setPerson] = useState<Person>("me");
  const [index, setIndex] = useState(0);
  const [myChoices, setMyChoices] = useState<number[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetSubmitting, setSheetSubmitting] = useState(false);
  const [sheetError, setSheetError] = useState<string | null>(null);
  const [recordSaved, setRecordSaved] = useState(false);

  const candidates = useMemo(() => {
    const avoids = defaultsForContext(context);
    return CONTENTS
      .filter((content) =>
        content.runtime <= MAX_RUNTIME && avoids.every((avoid) => !content.avoid.includes(avoid)),
      )
      .map((content) => ({
        content,
        score:
          (content.contexts.includes(context) ? CONTEXT_POINTS : 0) +
          (content.moods.includes(mood) ? MOOD_POINTS : 0),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_CANDIDATES)
      .map(({ content }) => content);
  }, [context, mood]);

  const current = candidates[index];
  const selected = candidates.find((content) => content.id === selectedId) ?? null;
  const progress = step === "context" ? 25 : step === "mood" ? 50 : step === "pick" ? 75 : step === "result" ? 100 : 0;

  const reset = () => {
    setStep("mode");
    setMode(null);
    setContext("");
    setMood("");
    setPerson("me");
    setIndex(0);
    setMyChoices([]);
    setSelectedId(null);
    setSheetOpen(false);
    setSheetError(null);
    setRecordSaved(false);
  };

  const startPicking = () => {
    setPerson("me");
    setIndex(0);
    setMyChoices([]);
    setSelectedId(null);
    setStep("pick");
  };

  const finishWithoutSelection = () => {
    setSelectedId(null);
    setStep("result");
  };

  const reactToCandidate = (liked: boolean) => {
    if (!current || !mode) return;

    if (mode === "solo") {
      if (liked) {
        setSelectedId(current.id);
        setStep("result");
      } else if (index < candidates.length - 1) {
        setIndex((currentIndex) => currentIndex + 1);
      } else {
        finishWithoutSelection();
      }
      return;
    }

    if (person === "me" && liked) setMyChoices((choices) => [...choices, current.id]);
    if (person === "other" && liked && myChoices.includes(current.id)) {
      setSelectedId(current.id);
      setStep("result");
      return;
    }

    if (index < candidates.length - 1) {
      setIndex((currentIndex) => currentIndex + 1);
      return;
    }

    if (person === "me") {
      setPerson("other");
      setIndex(0);
      return;
    }

    finishWithoutSelection();
  };

  const submitRecord = async (values: RatingSheetValues) => {
    if (!selected || !mode) return;

    setSheetSubmitting(true);
    setSheetError(null);
    try {
      await createRecord(
        {
          contentKey: contentKeyOf(selected),
          contentTitle: selected.title,
          contentFormat: selected.format,
          contentProvider: selected.provider,
          contentRuntime: selected.runtime,
          posterPalette: selected.palette,
        },
        { watchMode: mode, pickedContext: context, pickedMood: mood },
        values,
      );
      setRecordSaved(true);
      setSheetOpen(false);
    } catch (error) {
      setSheetError(error instanceof Error ? error.message : "저장에 실패했습니다.");
    } finally {
      setSheetSubmitting(false);
    }
  };

  return (
    <main className="hybrid-app">
      <div className="hybrid-ambient hybrid-ambient-left" />
      <div className="hybrid-ambient hybrid-ambient-right" />
      <header className="hybrid-header">
        <button type="button" className="hybrid-brand" onClick={reset} aria-label="같이볼래 처음으로">
          <i aria-hidden="true">✦</i><strong>같이</strong>볼래
        </button>
        <div>
          <Link href="/records">함께 본 목록</Link>
          {step !== "mode" ? <button type="button" onClick={reset}>처음부터</button> : null}
        </div>
      </header>

      {step !== "mode" ? (
        <div className="hybrid-progress" aria-label={`콘텐츠 선택 ${progress}% 완료`}>
          <span style={{ width: `${progress}%` }} />
        </div>
      ) : null}

      {step === "mode" ? (
        <section className="hybrid-intro hybrid-enter">
          <div className="hybrid-hero">
            <small>CONTEXT-AWARE CURATION</small>
            <h1>오늘 볼 콘텐츠를<br /><em>가볍게 골라요</em></h1>
            <p>상황과 무드만 짧게 고르면, 잘 맞는 후보를 한 편씩 보여드려요.</p>
          </div>
          <div className="hybrid-mode-card">
            <span className="hybrid-card-index">01</span>
            <h2>어떻게 볼까요?</h2>
            <div className="hybrid-mode-grid">
              <button type="button" onClick={() => { setMode("solo"); setStep("context"); }}>
                <i aria-hidden="true">◇</i><span><strong>혼자 고르기</strong><small>내 상황과 무드에 맞춰서</small></span><b>→</b>
              </button>
              <button type="button" className="primary" onClick={() => { setMode("together"); setStep("context"); }}>
                <i aria-hidden="true">◇◇</i><span><strong>함께 고르기</strong><small>각자 선택하고 공통 후보만 확인</small></span><b>→</b>
              </button>
            </div>
            <div className="hybrid-quick"><span>상황 선택</span><span>오늘의 무드</span><span>한 편씩 보기</span></div>
          </div>
        </section>
      ) : null}

      {step === "context" ? (
        <section className="hybrid-stage hybrid-enter">
          <div className="hybrid-stage-heading"><small>STEP 01 · CONTEXT</small><h1>지금은 어떤 시간인가요?</h1><p>상황을 고르면 보기 불편한 요소도 먼저 챙겨드려요.</p></div>
          <div className="hybrid-context-grid">
            {CONTEXTS.map((item) => (
              <button key={item.value} type="button" className={context === item.value ? "selected" : ""} onClick={() => setContext(item.value)}>
                <span aria-hidden="true">{item.icon}</span><strong>{item.value}</strong><small>{item.hint}</small><i aria-hidden="true">✓</i>
              </button>
            ))}
          </div>
          <div className="hybrid-stage-actions"><button type="button" onClick={() => setStep("mode")}>이전</button><button type="button" className="next" disabled={!context} onClick={() => setStep("mood")}>오늘의 무드 <span>→</span></button></div>
        </section>
      ) : null}

      {step === "mood" ? (
        <section className="hybrid-stage hybrid-enter">
          <div className="hybrid-stage-heading"><small>STEP 02 · MOOD</small><h1>오늘은 어떤 걸 보고 싶나요?</h1><p>{context}에 잘 맞는 후보 안에서 지금의 무드를 반영해요.</p></div>
          <div className="hybrid-mood-grid">
            {MOODS.map((item) => <button key={item} type="button" className={mood === item ? "selected" : ""} onClick={() => setMood(item)}>{item}<span aria-hidden="true">→</span></button>)}
          </div>
          <div className="hybrid-stage-actions"><button type="button" onClick={() => setStep("context")}>이전</button><button type="button" className="next" disabled={!mood} onClick={startPicking}>한 편씩 보기 <span>→</span></button></div>
        </section>
      ) : null}

      {step === "pick" && current ? (
        <section className="hybrid-pick hybrid-enter">
          {mode === "together" && person === "other" && index === 0 ? <div className="hybrid-handoff">함께 보는 사람에게 건네주세요 · 앞선 선택은 숨겨져 있어요</div> : null}
          <div className="hybrid-pick-top"><span>지금 고르는 사람 · {mode === "solo" || person === "me" ? "나" : "함께 보는 사람"}</span><strong>{index + 1} / 최대 {candidates.length}</strong></div>
          <div className="hybrid-pick-progress"><span style={{ width: `${((index + 1) / candidates.length) * 100}%` }} /></div>
          <article className="hybrid-content-card">
            <div className={`hybrid-poster ${current.palette}`}><small>{current.provider} · {current.runtime}분 · {current.format}</small><b>{current.title.slice(0, 1)}</b></div>
            <div className="hybrid-content-copy"><small>{current.eyebrow}</small><h1>{current.title}</h1><p>{current.synopsis}</p><div><span>✓ {reasonFor(current, context, mood)}</span><span>✓ 피하고 싶은 요소 확인 완료</span></div></div>
          </article>
          <div className="hybrid-pick-actions"><button type="button" onClick={() => reactToCandidate(false)}>제외하기</button><button type="button" className="keep" onClick={() => reactToCandidate(true)}>{mode === "solo" ? "이걸로 볼래요" : "후보로 남기기"}</button></div>
          <p className="hybrid-private">{mode === "together" ? "공통 선택이 생기면 바로 알려드려요" : "최대 5편 안에서 골라보세요"}</p>
        </section>
      ) : null}

      {step === "result" ? (
        <section className="hybrid-result hybrid-enter">
          <span className="hybrid-result-mark">{selected ? "✓" : "+"}</span>
          <small>{selected ? mode === "together" ? "공통 후보를 찾았어요" : "오늘의 선택" : "아직 맞는 후보가 없어요"}</small>
          <h1>{selected?.title ?? "후보를 조금 더 볼까요?"}</h1>
          {selected ? <div className="hybrid-result-card"><div className={`art ${selected.palette}`}>{selected.title.slice(0, 1)}</div><div><small>{context} · {mood}</small><h2>{selected.title}</h2><p>{selected.provider} · {selected.runtime}분 · {selected.format}</p></div></div> : <p className="hybrid-no-match">필수 조건은 유지했어요. 다른 상황이나 무드로 다시 골라보세요.</p>}
          {selected ? <button type="button" className="hybrid-result-primary" disabled={recordSaved} onClick={() => setSheetOpen(true)}>{recordSaved ? "기록 저장 완료 ✓" : "본 뒤 기록하기"}</button> : <button type="button" className="hybrid-result-primary" onClick={() => { setIndex(0); setStep("mood"); }}>다른 무드로 찾아보기</button>}
          <button type="button" className="hybrid-result-again" onClick={reset}>처음부터 다시 고르기</button>
        </section>
      ) : null}

      <footer className="hybrid-footer">같이볼래 · 상황은 짧게, 선택은 한 편씩</footer>
      {selected && sheetOpen ? (
        <RatingSheet
          title={selected.title}
          format={selected.format}
          submitting={sheetSubmitting}
          error={sheetError}
          onSubmit={submitRecord}
          onClose={() => setSheetOpen(false)}
        />
      ) : null}
    </main>
  );
}
