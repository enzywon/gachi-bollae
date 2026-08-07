"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import RatingSheet, { type RatingSheetValues } from "./_components/RatingSheet";
import { AVOIDS, CONTENTS, CONTEXTS, MOODS, PROVIDERS, TASTES, contentKeyOf, type DemoContent } from "./_data/contents";
import { createRecord } from "./_lib/client";

type Mode = "solo" | "together";
type Reaction = "pick" | "skip" | "watched";


const CONTEXT_POINTS = 35;
const MOOD_POINTS = 25;
const MY_TASTE_POINTS = 9;
const SHARED_TASTE_POINTS = 8;
const PARTNER_TASTE_POINTS = 4;
const MAX_TAG_MATCHES = Math.max(...CONTENTS.map((item) => item.tags.length));

function ToggleChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button type="button" className={`chip ${active ? "active" : ""}`} onClick={onClick} aria-pressed={active}>
      {active && <span aria-hidden="true">✓</span>}
      {children}
    </button>
  );
}

export default function Home() {
  const [mode, setMode] = useState<Mode | null>(null);
  const [step, setStep] = useState(0);
  const [context, setContext] = useState("");
  const [mood, setMood] = useState("");
  const [myTastes, setMyTastes] = useState<string[]>([]);
  const [partnerTastes, setPartnerTastes] = useState<string[]>([]);
  const [duration, setDuration] = useState("60분 이내");
  const [format, setFormat] = useState("상관없음");
  const [provider, setProvider] = useState("상관없음");
  const [avoids, setAvoids] = useState<string[]>([]);
  const [reactions, setReactions] = useState<Record<number, Reaction>>({});
  const [selectedContent, setSelectedContent] = useState<DemoContent | null>(null);
  const [refreshSeed, setRefreshSeed] = useState(0);

  // 기록과 평가 상태
  const [sheetTarget, setSheetTarget] = useState<DemoContent | null>(null);
  const [sheetSubmitting, setSheetSubmitting] = useState(false);
  const [sheetError, setSheetError] = useState<string | null>(null);
  const [savedIds, setSavedIds] = useState<number[]>([]);
  const [toast, setToast] = useState<string | null>(null);

  const toggleList = (value: string, list: string[], setter: (next: string[]) => void) => {
    setter(list.includes(value) ? list.filter((item) => item !== value) : [...list, value]);
  };

  const recommendations = useMemo(() => {
    const maxRuntime = duration === "30분 이내" ? 30 : duration === "60분 이내" ? 60 : 999;
    const countMatches = (tastes: string[], item: DemoContent) =>
      tastes.filter((taste) => item.tags.includes(taste)).length;

    // 재생 시간과 OTT는 필수 조건이라 통과한 항목은 모두 만족한다.
    // 점수에 넣어도 순위가 바뀌지 않으므로 적합도를 왜곡하지 않도록 제외한다.
    const score = (item: DemoContent) => {
      let points = 0;
      if (item.contexts.includes(context)) points += CONTEXT_POINTS;
      if (item.moods.includes(mood)) points += MOOD_POINTS;
      const mine = countMatches(myTastes, item);
      points += mine * MY_TASTE_POINTS;
      if (mode === "together") {
        const partner = countMatches(partnerTastes, item);
        points += Math.min(mine, partner) * SHARED_TASTE_POINTS + partner * PARTNER_TASTE_POINTS;
      }
      return points;
    };

    // 선택한 조건으로 받을 수 있는 최고 점수. 적합도의 분모가 된다.
    const cap = (tastes: string[]) => Math.min(tastes.length, MAX_TAG_MATCHES);
    let bestPossible = CONTEXT_POINTS + MOOD_POINTS + cap(myTastes) * MY_TASTE_POINTS;
    if (mode === "together") {
      bestPossible +=
        Math.min(cap(myTastes), cap(partnerTastes)) * SHARED_TASTE_POINTS +
        cap(partnerTastes) * PARTNER_TASTE_POINTS;
    }

    const eligible = CONTENTS.filter((item) => {
      const durationOkay = item.runtime <= maxRuntime;
      const formatOkay = format === "상관없음" || item.format === format;
      const providerOkay = provider === "상관없음" || item.provider === provider;
      const safe = avoids.every((avoid) => !item.avoid.includes(avoid));
      return durationOkay && formatOkay && providerOkay && safe;
    }).sort((a, b) => score(b) - score(a));

    if (eligible.length === 0) return [];
    const offset = refreshSeed % eligible.length;
    return [...eligible.slice(offset), ...eligible.slice(0, offset)]
      .slice(0, 3)
      .map((item) => ({ item, fit: Math.min(100, Math.round((score(item) / bestPossible) * 100)) }))
      .sort((a, b) => b.fit - a.fit);
  }, [avoids, context, duration, format, mode, mood, myTastes, partnerTastes, provider, refreshSeed]);

  const reset = () => {
    setMode(null);
    setStep(0);
    setContext("");
    setMood("");
    setMyTastes([]);
    setPartnerTastes([]);
    setDuration("60분 이내");
    setFormat("상관없음");
    setProvider("상관없음");
    setAvoids([]);
    setReactions({});
    setSelectedContent(null);
    setRefreshSeed(0);
    setSheetTarget(null);
    setSheetError(null);
    setSavedIds([]);
    setToast(null);
  };

  const openSheet = (content: DemoContent) => {
    setSheetError(null);
    setSheetTarget(content);
  };

  /** 추천 맥락을 함께 저장해 두면 나중에 어떤 상황의 선택이 좋았는지 볼 수 있다. PRD 7.1. */
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
        { watchMode: mode, pickedContext: context || null, pickedMood: mood || null },
        values
      );

      setSavedIds((current) => (current.includes(sheetTarget.id) ? current : [...current, sheetTarget.id]));
      setToast(
        values.rating === null
          ? `“${sheetTarget.title}” 기록을 저장했어요. 별점은 나중에 남길 수 있어요.`
          : `“${sheetTarget.title}” 기록과 ${values.rating}점 평가를 저장했어요.`
      );
      setSheetTarget(null);
    } catch (error) {
      setSheetError(error instanceof Error ? error.message : "저장에 실패했습니다.");
    } finally {
      setSheetSubmitting(false);
    }
  };

  const selectMode = (nextMode: Mode) => {
    setMode(nextMode);
    setStep(1);
  };

  const setContextWithDefaults = (value: string) => {
    setContext(value);
    if (value === "식사 중") setAvoids((current) => Array.from(new Set([...current, "잔인함·고어", "불쾌한 소재"])));
    if (value === "자기 전") setAvoids((current) => Array.from(new Set([...current, "공포·깜짝", "무거운 분위기"])));
  };

  const progress = step === 0 ? 0 : Math.min(step, 4) * 25;

  return (
    <main className="app-shell">
      <div className="ambient ambient-left" />
      <div className="ambient ambient-right" />
      <header className="topbar">
        <button type="button" className="brand" onClick={reset} aria-label="같이볼래 처음으로">
          <i aria-hidden="true">✦</i><span>같이</span>볼래
        </button>
        <div className="header-meta">
          {step > 0 && step < 4 && <span className="step-label">{step} / 3</span>}
          <Link className="reset-button" href="/records">
            함께 본 목록
          </Link>
          {step > 0 && (
            <button type="button" className="reset-button" onClick={reset}>
              처음부터
            </button>
          )}
        </div>
      </header>

      {step > 0 && step < 4 && (
        <div className="progress-track" aria-label={`추천 조건 입력 ${progress}% 완료`}>
          <span style={{ width: `${progress}%` }} />
        </div>
      )}

      <div className="content-wrap">
        {step === 0 && (
          <section className="intro-stage page-enter">
            <div className="hero-copy">
              <span className="eyebrow">CONTEXT-AWARE CURATION</span>
              <h1>
                지금, 함께 보기 좋은
                <br />
                <em>콘텐츠</em>
              </h1>
              <p>상황과 취향을 맞춰 3분 안에 골라드려요.</p>
              <span className="cute-note">🍿 오늘은 고르느라 지치지 말아요</span>
            </div>

            <div className="mode-card glass-card">
              <span className="question-number">01</span>
              <h2>누구와 볼까요?</h2>
              <p className="card-description">둘이 고르면 더 재밌으니까, 모두 만족할 선택을 찾아볼게요.</p>
              <div className="mode-grid">
                <button type="button" className="mode-button outline" onClick={() => selectMode("solo")}>
                  <span className="mode-icon" aria-hidden="true">🍿</span>
                  <span><strong>혼자 볼게요</strong><small>내 취향과 지금 상황에 맞춰서</small></span>
                  <b aria-hidden="true">→</b>
                </button>
                <button type="button" className="mode-button primary" onClick={() => selectMode("together")}>
                  <span className="mode-icon pair" aria-hidden="true">💞</span>
                  <span><strong>함께 볼게요</strong><small>두 사람의 취향을 균형 있게</small></span>
                  <b aria-hidden="true">→</b>
                </button>
              </div>
              <div className="quick-contexts" aria-label="지원하는 상황">
                <span>🍽️&nbsp; 식사 중</span>
                <span>🌙&nbsp; 자기 전</span>
                <span>🔎&nbsp; 집중해서 보기</span>
              </div>
            </div>
          </section>
        )}

        {step === 1 && (
          <section className="form-stage page-enter">
            <div className="stage-heading">
              <span className="eyebrow">STEP 01 · CONTEXT</span>
              <h1>지금은 어떤 시간인가요?</h1>
              <p>상황을 선택하면 피하고 싶은 요소도 먼저 챙겨드려요.</p>
            </div>
            <div className="context-grid">
              {CONTEXTS.map((item) => (
                <button
                  type="button"
                  key={item.value}
                  className={`context-card ${context === item.value ? "selected" : ""}`}
                  onClick={() => setContextWithDefaults(item.value)}
                  aria-pressed={context === item.value}
                >
                  <span className="context-icon" aria-hidden="true">{item.icon}</span>
                  <strong>{item.value}</strong>
                  <small>{item.hint}</small>
                  <i aria-hidden="true">✓</i>
                </button>
              ))}
            </div>
            <div className="action-row">
              <button type="button" className="back-button" onClick={() => setStep(0)}>← 이전</button>
              <button type="button" className="next-button" disabled={!context} onClick={() => setStep(2)}>다음 · 취향 맞추기 <span>→</span></button>
            </div>
          </section>
        )}

        {step === 2 && (
          <section className="form-stage page-enter">
            <div className="stage-heading">
              <span className="eyebrow">STEP 02 · TASTE</span>
              <h1>{mode === "together" ? "우리 둘은 뭘 좋아할까요?" : "오늘은 어떤 느낌이 좋아요?"}</h1>
              <p>좋아하는 게 달라도 괜찮아요. 둘 다 수용할 수 있는 지점을 찾아볼게요.</p>
            </div>

            <div className="taste-layout">
              <div className="glass-card compact-card">
                <h2>오늘 원하는 무드 <small>하나만 선택</small></h2>
                <div className="chip-row">
                  {MOODS.map((item) => <ToggleChip key={item} active={mood === item} onClick={() => setMood(item)}>{item}</ToggleChip>)}
                </div>
              </div>
              <div className="taste-panels">
                <div className="glass-card compact-card">
                  <h2>{mode === "together" ? "나의 취향" : "선호 장르"} <small>여러 개 선택 가능</small></h2>
                  <div className="chip-row">
                    {TASTES.map((item) => <ToggleChip key={item} active={myTastes.includes(item)} onClick={() => toggleList(item, myTastes, setMyTastes)}>{item}</ToggleChip>)}
                  </div>
                </div>
                {mode === "together" && (
                  <div className="glass-card compact-card partner-card">
                    <h2>파트너 취향 <small>파트너에게 골라달라고 해보세요</small></h2>
                    <div className="chip-row">
                      {TASTES.map((item) => <ToggleChip key={item} active={partnerTastes.includes(item)} onClick={() => toggleList(item, partnerTastes, setPartnerTastes)}>{item}</ToggleChip>)}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="action-row">
              <button type="button" className="back-button" onClick={() => setStep(1)}>← 이전</button>
              <button type="button" className="next-button" disabled={!mood || myTastes.length === 0 || (mode === "together" && partnerTastes.length === 0)} onClick={() => setStep(3)}>다음 · 조건 확인 <span>→</span></button>
            </div>
          </section>
        )}

        {step === 3 && (
          <section className="form-stage page-enter">
            <div className="stage-heading">
              <span className="eyebrow">STEP 03 · FILTER</span>
              <h1>마지막으로 조건을 맞춰볼게요.</h1>
              <p>필수 조건은 추천할 때 절대 임의로 해제하지 않아요.</p>
            </div>
            <div className="filter-grid">
              <div className="glass-card compact-card filter-card">
                <h2>얼마나 볼 수 있나요?</h2>
                <div className="segmented">
                  {["30분 이내", "60분 이내", "120분 이상"].map((item) => (
                    <button type="button" key={item} className={duration === item ? "active" : ""} onClick={() => setDuration(item)}>{item}</button>
                  ))}
                </div>
              </div>
              <div className="glass-card compact-card filter-card">
                <h2>어떤 콘텐츠가 좋아요?</h2>
                <div className="segmented">
                  {["상관없음", "영화", "시리즈", "예능"].map((item) => (
                    <button type="button" key={item} className={format === item ? "active" : ""} onClick={() => setFormat(item)}>{item}</button>
                  ))}
                </div>
              </div>
              <div className="glass-card compact-card filter-card full">
                <h2>이용 중인 OTT</h2>
                <div className="chip-row">
                  {PROVIDERS.map((item) => <ToggleChip key={item} active={provider === item} onClick={() => setProvider(item)}>{item}</ToggleChip>)}
                </div>
              </div>
              <div className="glass-card compact-card filter-card full avoid-card">
                <div className="filter-title-row">
                  <h2>지금은 피하고 싶어요</h2>
                  {avoids.length > 0 && <span>{context} 기준으로 {avoids.length}개 적용 중</span>}
                </div>
                <div className="chip-row">
                  {AVOIDS.map((item) => <ToggleChip key={item} active={avoids.includes(item)} onClick={() => toggleList(item, avoids, setAvoids)}>{item}</ToggleChip>)}
                </div>
              </div>
            </div>
            <div className="action-row">
              <button type="button" className="back-button" onClick={() => setStep(2)}>← 이전</button>
              <button type="button" className="next-button sparkle" onClick={() => setStep(4)}>✨ 우리 취향 모아보기 <span>→</span></button>
            </div>
          </section>
        )}

        {step === 4 && (
          <section className="results-stage page-enter">
            <div className="results-heading">
              <div>
                <span className="eyebrow">YOUR PICKS</span>
                <h1>{recommendations.length === 0 ? "조건에 맞는 콘텐츠가 없어요." : mode === "together" ? `두 분께 잘 맞는 ${recommendations.length}개예요.` : `지금 보기 좋은 ${recommendations.length}개예요.`}</h1>
                <p>{context} · {mood} · {duration} 기준으로 골랐어요.</p>
              </div>
              <button type="button" className="edit-button" onClick={() => setStep(3)}>조건 수정</button>
            </div>

            {toast && (
              <div className="save-toast" role="status">
                <span aria-hidden="true">✓</span>
                <p>{toast}</p>
                <Link href="/records">기록 보러 가기</Link>
                <button type="button" onClick={() => setToast(null)} aria-label="알림 닫기">✕</button>
              </div>
            )}

            {selectedContent && (
              <div className="selection-banner" role="status">
                <span aria-hidden="true">✓</span>
                <div>
                  <strong>“{selectedContent.title}”로 결정했어요!</strong>
                  <p>
                    {savedIds.includes(selectedContent.id)
                      ? "기록을 남겼어요. 다 보고 나서 평가를 수정할 수도 있어요."
                      : "다 보고 나면 별점과 한 줄 감상을 남겨 보세요."}
                  </p>
                </div>
                <button type="button" className="banner-record" onClick={() => openSheet(selectedContent)}>
                  다 봤어요, 기록하기
                </button>
                <button type="button" onClick={reset}>새로 고르기</button>
              </div>
            )}

            {recommendations.length === 0 && (
              <div className="empty-state">
                <span aria-hidden="true">⌕</span>
                <h2>필수 조건은 그대로 지켰어요.</h2>
                <p>가용 시간이나 콘텐츠 유형 같은 선호 조건을 조금 넓히면 결과를 찾을 수 있어요.</p>
                <button type="button" onClick={() => setStep(3)}>조건 다시 보기</button>
              </div>
            )}

            <div className="result-grid">
              {recommendations.map(({ item, fit }, index) => {
                const reaction = reactions[item.id];
                const matchedTaste = [...myTastes, ...partnerTastes].find((taste) => item.tags.includes(taste));
                // 점수에 실제로 반영된 근거만 노출한다.
                const matchedReasons = [
                  item.contexts.includes(context) ? `${context}에 잘 맞아요` : null,
                  item.moods.includes(mood) ? "오늘 무드와 잘 맞아요" : null,
                  matchedTaste ? `${matchedTaste} 취향 반영` : null,
                  avoids.length > 0 ? "피하고 싶다고 한 요소가 없어요" : null,
                ].filter((reason) => reason !== null);
                const reasons = matchedReasons.length > 0 ? matchedReasons : ["선택한 필수 조건을 모두 만족해요"];
                return (
                  <article key={item.id} className={`result-card ${reaction ? `reacted-${reaction}` : ""}`}>
                    <div className={`demo-poster ${item.palette}`}>
                      <span className="rank">0{index + 1}</span>
                      <div className="poster-orbit" />
                      <div className="poster-title"><small>GACHI BOLLAE DEMO PICK</small><strong>{item.title}</strong></div>
                    </div>
                    <div className="result-body">
                      <div className="result-topline"><span>{item.eyebrow}</span><b>{mode === "together" ? `${fit}% 함께 만족` : `${fit}% 적합`}</b></div>
                      <h2>{item.title}</h2>
                      <div className="metadata"><span>{item.format}</span><span>{item.runtime}분</span><span>{item.provider}</span></div>
                      <p className="synopsis">{item.synopsis}</p>
                      <div className="reason-list">
                        {reasons.map((reason) => <span key={reason}>✓ {reason}</span>)}
                      </div>
                      <button
                        type="button"
                        className="pick-button"
                        onClick={() => { setReactions((current) => ({ ...current, [item.id]: "pick" })); setSelectedContent(item); }}
                      >
                        {reaction === "pick" ? "선택 완료 ✓" : "이걸 볼게요"}
                      </button>
                      <div className="reaction-row">
                        <button type="button" className={reaction === "skip" ? "active" : ""} onClick={() => setReactions((current) => ({ ...current, [item.id]: "skip" }))}>별로예요</button>
                        <button type="button" className={reaction === "watched" ? "active" : ""} onClick={() => setReactions((current) => ({ ...current, [item.id]: "watched" }))}>이미 봤어요</button>
                      </div>
                      {/* 이미 본 콘텐츠도 그 자리에서 평가를 남길 수 있다. PRD 7.1 진입점. */}
                      {reaction === "watched" && (
                        <button type="button" className="record-link-button" onClick={() => openSheet(item)}>
                          {savedIds.includes(item.id) ? "기록 완료 · 하나 더 남기기" : "평가 남기기"}
                        </button>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>

            {recommendations.length > 0 && <div className="result-footer">
              <p>마음에 드는 게 없나요? 거절한 콘텐츠를 제외하고 다시 찾아볼게요.</p>
              <button type="button" onClick={() => { setReactions({}); setSelectedContent(null); setRefreshSeed((value) => value + 3); }}>↻ 다른 3개 보기</button>
            </div>}
            <p className="demo-notice">현재 화면은 추천 경험 검증을 위한 데모입니다. 정식 서비스에서는 TMDB 기반 콘텐츠와 실시간 시청처 정보를 제공합니다.</p>
          </section>
        )}
      </div>

      <footer className="site-footer">
        <span>같이볼래 · 오늘 우리에게 맞는 선택</span>
        <span>This product uses the TMDB API but is not endorsed or certified by TMDB.</span>
      </footer>

      {sheetTarget && (
        <RatingSheet
          title={sheetTarget.title}
          format={sheetTarget.format}
          notice={
            savedIds.includes(sheetTarget.id)
              ? "이미 기록한 콘텐츠예요. 저장하면 재시청 기록으로 추가됩니다."
              : null
          }
          submitting={sheetSubmitting}
          error={sheetError}
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
