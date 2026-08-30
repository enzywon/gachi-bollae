"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { kstDefaultRecordDate, kstToday } from "../_lib/date";
import {
  MAX_COMMENT_LENGTH,
  MAX_MEMO_LENGTH,
  WATCH_STATUSES,
  WATCH_STATUS_LABEL,
  allowsSeason,
  requiresFinishedOn,
  type WatchStatus,
} from "../_lib/types";

export type RatingSheetValues = {
  watchStatus: WatchStatus;
  startedOn: string;
  finishedOn: string;
  seasonNumber: string;
  memo: string;
  rating: number | null;
  shortComment: string;
};

type Props = {
  title: string;
  format: string;
  /** 화면에 그대로 노출하는 부가 설명. 재시청 안내 등에 사용한다. */
  notice?: string | null;
  initial?: Partial<RatingSheetValues>;
  /** 평가 수정 진입일 때 `수정됨` 표시에 사용한다. PRD 7.3. */
  editMeta?: { editCount: number; editedAt: string | null } | null;
  submitting: boolean;
  error: string | null;
  submitLabel?: string;
  onSubmit: (values: RatingSheetValues) => void;
  onClose: () => void;
};

const RATINGS = [1, 2, 3, 4, 5];

function defaultValues(): RatingSheetValues {
  return {
    watchStatus: "completed",
    startedOn: "",
    finishedOn: kstDefaultRecordDate(),
    seasonNumber: "",
    memo: "",
    rating: null,
    shortComment: "",
  };
}

function formatEditedAt(value: string | null): string {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Seoul",
  }).format(parsed);
}

export default function RatingSheet({
  title,
  format,
  notice,
  initial,
  editMeta,
  submitting,
  error,
  submitLabel = "저장하기",
  onSubmit,
  onClose,
}: Props) {
  const [values, setValues] = useState<RatingSheetValues>(() => ({ ...defaultValues(), ...initial }));
  const today = useMemo(() => kstToday(), []);
  const seasonAllowed = allowsSeason(format);
  const sheetRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const scrollY = window.scrollY;
    const { style } = document.body;
    const restore = { position: style.position, top: style.top, width: style.width };
    const opener = document.activeElement;

    style.position = "fixed";
    style.top = `-${scrollY}px`;
    style.width = "100%";
    sheetRef.current?.focus();

    const trapFocus = (event: KeyboardEvent) => {
      if (event.key !== "Tab" || !sheetRef.current) return;
      const focusable = Array.from(
        sheetRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
        ),
      );
      if (focusable.length === 0) {
        event.preventDefault();
        sheetRef.current.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      const focusOutside = !active || !sheetRef.current.contains(active);
      if (event.shiftKey && (active === first || active === sheetRef.current || focusOutside)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || active === sheetRef.current || focusOutside)) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", trapFocus);

    return () => {
      document.removeEventListener("keydown", trapFocus);
      style.position = restore.position;
      style.top = restore.top;
      style.width = restore.width;
      const rootStyle = document.documentElement.style;
      const previousScrollBehavior = rootStyle.scrollBehavior;
      rootStyle.scrollBehavior = "auto";
      window.scrollTo({ top: scrollY, left: 0, behavior: "auto" });
      rootStyle.scrollBehavior = previousScrollBehavior;
      if (opener instanceof HTMLElement) opener.focus({ preventScroll: true });
    };
  }, []);

  /**
   * 저장 중에는 닫기를 무시한다.
   * 쓰기는 계속 진행되는데 시트만 사라지면 사용자는 취소된 것으로 읽는다.
   */
  const requestClose = useCallback(() => {
    if (submitting) return;
    onClose();
  }, [submitting, onClose]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") requestClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [requestClose]);

  const update = <K extends keyof RatingSheetValues>(key: K, value: RatingSheetValues[K]) => {
    setValues((current) => ({ ...current, [key]: value }));
  };

  /** 상태를 바꾸면 새 상태에 필요한 날짜를 기본값으로 채워준다. PRD 7.7. */
  const changeStatus = (status: WatchStatus) => {
    setValues((current) => {
      const next = { ...current, watchStatus: status };
      if (status === "watching" && !next.startedOn) next.startedOn = kstDefaultRecordDate();
      if (requiresFinishedOn(status) && !next.finishedOn) next.finishedOn = kstDefaultRecordDate();
      return next;
    });
  };

  const commentLength = values.shortComment.length;
  const editedLabel = editMeta && editMeta.editCount > 0
    ? editMeta.editCount === 1
      ? "수정됨"
      : `${editMeta.editCount}회 수정됨`
    : null;

  return (
    <div className="sheet-backdrop" role="presentation" onClick={requestClose}>
      <section
        ref={sheetRef}
        tabIndex={-1}
        className="rating-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={`${title} 기록하기`}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="sheet-header">
          <div>
            <span className="sheet-eyebrow">{format}</span>
            <h2>{title}</h2>
            {editedLabel && (
              <p className="sheet-edit-meta">
                {editedLabel}
                {editMeta?.editedAt && ` · 마지막 수정 ${formatEditedAt(editMeta.editedAt)}`}
              </p>
            )}
          </div>
          <button
            type="button"
            className="sheet-close"
            onClick={requestClose}
            disabled={submitting}
            aria-label="닫기"
          >
            ✕
          </button>
        </header>

        {notice && <p className="sheet-notice">{notice}</p>}

        <div className="sheet-body">
          <fieldset className="sheet-field">
            <legend>별점</legend>
            <div className="star-row">
              {RATINGS.map((score) => {
                const active = values.rating !== null && score <= values.rating;
                return (
                  <button
                    type="button"
                    key={score}
                    className={`star-button ${active ? "active" : ""}`}
                    aria-pressed={values.rating === score}
                    aria-label={`${score}점`}
                    onClick={() => update("rating", values.rating === score ? null : score)}
                  >
                    {active ? "★" : "☆"}
                  </button>
                );
              })}
              {/* 상태를 색상으로만 전달하지 않는다. PRD 10.6. */}
              <span className="star-value">
                {values.rating === null ? "별점 없음" : `${values.rating}점`}
              </span>
            </div>
            <p className="field-hint">별점 없이 저장하면 미평가 기록으로 남고 나중에 평가할 수 있어요.</p>
          </fieldset>

          <label className="sheet-field">
            <span className="field-label">
              한 줄 감상
              <b className={commentLength > MAX_COMMENT_LENGTH ? "over" : ""}>
                {commentLength} / {MAX_COMMENT_LENGTH}
              </b>
            </span>
            <textarea
              value={values.shortComment}
              onChange={(event) => update("shortComment", event.target.value)}
              placeholder="한 문장으로 남겨 보세요"
              maxLength={MAX_COMMENT_LENGTH}
              rows={2}
            />
          </label>

          <fieldset className="sheet-field">
            <legend>시청 상태</legend>
            <div className="segmented">
              {WATCH_STATUSES.map((status) => (
                <button
                  type="button"
                  key={status}
                  className={values.watchStatus === status ? "active" : ""}
                  aria-pressed={values.watchStatus === status}
                  onClick={() => changeStatus(status)}
                >
                  {WATCH_STATUS_LABEL[status]}
                </button>
              ))}
            </div>
          </fieldset>

          <div className="sheet-grid">
            {values.watchStatus === "watching" ? (
              <label className="sheet-field">
                <span className="field-label">시작일</span>
                <input
                  type="date"
                  max={today}
                  value={values.startedOn}
                  onChange={(event) => update("startedOn", event.target.value)}
                />
              </label>
            ) : (
              <label className="sheet-field">
                <span className="field-label">종료일</span>
                <input
                  type="date"
                  max={today}
                  value={values.finishedOn}
                  onChange={(event) => update("finishedOn", event.target.value)}
                />
              </label>
            )}

            {seasonAllowed && (
              <label className="sheet-field">
                <span className="field-label">시즌 <small>선택</small></span>
                <input
                  type="number"
                  min={0}
                  inputMode="numeric"
                  placeholder="예: 1"
                  value={values.seasonNumber}
                  onChange={(event) => update("seasonNumber", event.target.value)}
                />
              </label>
            )}
          </div>

          <label className="sheet-field">
            <span className="field-label">메모 <small>선택</small></span>
            <input
              type="text"
              maxLength={MAX_MEMO_LENGTH}
              value={values.memo}
              onChange={(event) => update("memo", event.target.value)}
              placeholder="같이 본 사람, 기억하고 싶은 장면"
            />
          </label>
        </div>

        {error && (
          <p className="sheet-error" role="alert">
            {error}
          </p>
        )}

        <footer className="sheet-footer">
          <button type="button" className="sheet-cancel" onClick={requestClose} disabled={submitting}>
            취소
          </button>
          <button
            type="button"
            className="sheet-submit"
            onClick={() => onSubmit(values)}
            disabled={submitting}
          >
            {submitting ? "저장 중…" : submitLabel}
          </button>
        </footer>
      </section>
    </div>
  );
}
