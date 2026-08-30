"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import RatingSheet, { type RatingSheetValues } from "../_components/RatingSheet";
import { fetchRecords, removeRecord, saveReview, updateRecord } from "../_lib/client";
import { baseDateOf, formatKoreanDate } from "../_lib/date";
import {
  CONTENT_FORMATS,
  WATCH_STATUSES,
  WATCH_STATUS_LABEL,
  type RecordDto,
  type RecordGroupDto,
  type RecordListResponse,
  type SortKey,
} from "../_lib/types";

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "recent", label: "최근 시청순" },
  { value: "rating", label: "별점 높은 순" },
];

function Stars({ rating }: { rating: number | null }) {
  if (rating === null) {
    return <span className="stars none">별점 없음</span>;
  }
  return (
    <span className="stars" aria-label={`${rating}점`}>
      <b aria-hidden="true">{"★".repeat(rating)}</b>
      <i aria-hidden="true">{"☆".repeat(5 - rating)}</i>
      <em>{rating}점</em>
    </span>
  );
}

function editedLabelOf(record: RecordDto): string | null {
  const count = record.review?.editCount ?? 0;
  if (count === 0) return null;
  return count === 1 ? "수정됨" : `${count}회 수정됨`;
}

function seasonLabel(record: RecordDto): string | null {
  return record.seasonNumber === null ? null : `시즌 ${record.seasonNumber}`;
}

export default function RecordsPage() {
  const [data, setData] = useState<RecordListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [sort, setSort] = useState<SortKey>("recent");
  const [format, setFormat] = useState("all");
  const [status, setStatus] = useState("all");

  const [openKey, setOpenKey] = useState<string | null>(null);
  const [editing, setEditing] = useState<RecordDto | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [sheetError, setSheetError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [reloadToken, setReloadToken] = useState(0);

  // 로딩 표시는 이벤트 핸들러에서 켜고, 효과는 외부 데이터와 동기화만 한다.
  const reload = useCallback(() => {
    setLoading(true);
    setReloadToken((token) => token + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;

    fetchRecords({ sort, format, status })
      .then((result) => {
        if (cancelled) return;
        setData(result);
        setLoadError(null);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setLoadError(error instanceof Error ? error.message : "기록을 불러오지 못했습니다.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [sort, format, status, reloadToken]);

  const changeSort = (value: SortKey) => {
    setSort(value);
    setLoading(true);
  };

  const changeFormat = (value: string) => {
    setFormat(value);
    setLoading(true);
  };

  const changeStatus = (value: string) => {
    setStatus(value);
    setLoading(true);
  };

  const groups = data?.groups ?? [];
  const unrated = data?.unrated ?? [];

  const filterActive = format !== "all" || status !== "all";

  const emptyMessage = useMemo(() => {
    if (data && data.totalRecords === 0) return "아직 남긴 기록이 없어요.";
    if (filterActive) return "조건에 맞는 기록이 없어요.";
    return "표시할 기록이 없어요.";
  }, [data, filterActive]);

  /**
   * 기록 수정과 평가 저장을 함께 처리한다.
   * 평가는 별도 엔드포인트라 두 번 호출한다. PRD 10.1.
   */
  const submitEdit = async (values: RatingSheetValues) => {
    if (!editing) return;

    if (editing.review && values.rating === null) {
      setSheetError("별점만 따로 지울 수는 없어요. 기록을 삭제하면 평가도 함께 사라집니다.");
      return;
    }

    setSubmitting(true);
    setSheetError(null);

    try {
      await updateRecord(editing.id, values);
      if (values.rating !== null) {
        await saveReview(editing.id, values);
      }
      setEditing(null);
      setNotice("기록을 저장했어요.");
      reload();
    } catch (error) {
      setSheetError(error instanceof Error ? error.message : "저장에 실패했습니다.");
    } finally {
      setSubmitting(false);
    }
  };

  const confirmDelete = async (record: RecordDto) => {
    const agreed = window.confirm(
      `“${record.contentTitle}” 기록을 삭제할까요?\n\n` +
        "이 기록에 남긴 별점과 한 줄 감상도 함께 삭제되며 복구할 수 없어요.\n" +
        "상태를 잘못 입력한 경우라면 삭제 대신 상태를 바꿔 주세요."
    );
    if (!agreed) return;

    try {
      await removeRecord(record.id);
      setNotice("기록을 삭제했어요.");
      reload();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "삭제에 실패했습니다.");
    }
  };

  const openEditor = (record: RecordDto) => {
    setSheetError(null);
    setEditing(record);
  };

  return (
    <main className="records-app">
      <header className="records-header">
        <Link className="match-brand" href="/" aria-label="같이볼래 처음으로">
          <span aria-hidden="true">●</span> 같이볼래
        </Link>
        <Link className="records-recommend" href="/">새로 고르기 <span aria-hidden="true">→</span></Link>
      </header>

      <div className="records-wrap">
        <section className="records-stage page-enter">
          <div className="records-heading">
            <span>우리의 시청 기록</span>
            <h1>함께 본 목록</h1>
            <p>함께 고른 순간과 감상을 한곳에 모았어요.</p>
          </div>

          <div className="records-overview" aria-label="기록 요약">
            <div><strong>{data?.totalRecords ?? "—"}</strong><span>전체 기록</span></div>
            <div><strong>{groups.length || "—"}</strong><span>함께 본 작품</span></div>
            <div><strong>{unrated.length}</strong><span>남길 평가</span></div>
          </div>

          {notice && (
            <div className="save-toast" role="status">
              <span aria-hidden="true">✓</span>
              <p>{notice}</p>
              <button type="button" onClick={() => setNotice(null)} aria-label="알림 닫기">
                ✕
              </button>
            </div>
          )}

          {unrated.length > 0 && (
            <div className="unrated-panel">
              <div className="unrated-head">
                <span aria-hidden="true">✦</span>
                <div><h2>감상을 기다리는 작품 {unrated.length}개</h2>
                <p>별점과 한 줄 감상을 남기면 다음 선택에 참고할 수 있어요.</p></div>
              </div>
              <ul className="unrated-list">
                {unrated.slice(0, 5).map((record) => (
                  <li key={record.id}>
                    <div>
                      <strong>{record.contentTitle}</strong>
                      <small>
                        {formatKoreanDate(baseDateOf(record))} · {WATCH_STATUS_LABEL[record.watchStatus]}
                        {seasonLabel(record) ? ` · ${seasonLabel(record)}` : ""}
                      </small>
                    </div>
                    <button type="button" onClick={() => openEditor(record)}>
                      평가하기
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="records-toolbar">
            <div className="toolbar-group">
              <label className="toolbar-label" htmlFor="record-sort">정렬</label>
              <select id="record-sort" value={sort} onChange={(event) => changeSort(event.target.value as SortKey)}>
                {SORT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </div>

            <div className="toolbar-group">
              <label className="toolbar-label" htmlFor="record-format">형식</label>
              <select id="record-format" value={format} onChange={(event) => changeFormat(event.target.value)}>
                <option value="all">모든 형식</option>
                {CONTENT_FORMATS.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </div>

            <div className="toolbar-group">
              <label className="toolbar-label" htmlFor="record-status">상태</label>
              <select id="record-status" value={status} onChange={(event) => changeStatus(event.target.value)}>
                <option value="all">모든 상태</option>
                {WATCH_STATUSES.map((item) => <option key={item} value={item}>{WATCH_STATUS_LABEL[item]}</option>)}
              </select>
            </div>
          </div>

          {loading && <p className="records-status">기록을 불러오는 중이에요…</p>}

          {loadError && (
            <div className="empty-state" role="alert">
              <span aria-hidden="true">!</span>
              <h2>기록을 불러오지 못했어요.</h2>
              <p>{loadError}</p>
              <button type="button" onClick={reload}>
                다시 시도
              </button>
            </div>
          )}

          {!loading && !loadError && groups.length === 0 && (
            <div className="empty-state">
              <span aria-hidden="true">◎</span>
              <h2>{emptyMessage}</h2>
              <p>추천을 받고 본 콘텐츠를 기록하면 여기에 쌓여요.</p>
              <Link href="/">추천받으러 가기</Link>
            </div>
          )}

          <div className="record-list">
            {groups.map((group) => (
              <RecordGroupCard
                key={group.contentKey}
                group={group}
                open={openKey === group.contentKey}
                onToggle={() => setOpenKey(openKey === group.contentKey ? null : group.contentKey)}
                onEdit={openEditor}
                onDelete={confirmDelete}
              />
            ))}
          </div>
        </section>
      </div>

      <footer className="records-footer">
        <span>같이볼래 · 오늘 우리에게 맞는 선택</span>
        <span>This product uses the TMDB API but is not endorsed or certified by TMDB.</span>
      </footer>

      {editing && (
        <RatingSheet
          title={editing.contentTitle}
          format={editing.contentFormat}
          submitLabel="수정 저장"
          editMeta={
            editing.review ? { editCount: editing.review.editCount, editedAt: editing.review.editedAt } : null
          }
          initial={{
            watchStatus: editing.watchStatus,
            startedOn: editing.startedOn ?? "",
            finishedOn: editing.finishedOn ?? "",
            seasonNumber: editing.seasonNumber === null ? "" : String(editing.seasonNumber),
            memo: editing.memo ?? "",
            rating: editing.review?.rating ?? null,
            shortComment: editing.review?.shortComment ?? "",
          }}
          submitting={submitting}
          error={sheetError}
          onSubmit={submitEdit}
          onClose={() => {
            setEditing(null);
            setSheetError(null);
          }}
        />
      )}
    </main>
  );
}

function RecordGroupCard({
  group,
  open,
  onToggle,
  onEdit,
  onDelete,
}: {
  group: RecordGroupDto;
  open: boolean;
  onToggle: () => void;
  onEdit: (record: RecordDto) => void;
  onDelete: (record: RecordDto) => void;
}) {
  const rep = group.representative;
  const edited = editedLabelOf(rep);

  return (
    <article className={`record-card glass-card ${open ? "open" : ""}`}>
      <button
        type="button"
        className="record-card-head"
        onClick={onToggle}
        aria-expanded={open}
        aria-label={`${group.contentTitle} 기록 ${open ? "접기" : "펼치기"}`}
      >
        <div className={`record-poster ${group.posterPalette ?? "poster-plum"}`} aria-hidden="true">
          {group.contentTitle.slice(0, 1)}
        </div>

        <div className="record-summary">
          <div className="record-title-row">
            <h2>{group.contentTitle}</h2>
            {group.rewatchCount > 1 && <span className="rewatch-badge">{group.rewatchCount}번 봤어요</span>}
          </div>
          <div className="record-meta">
            <span>{group.contentFormat}</span>
            <span>{WATCH_STATUS_LABEL[rep.watchStatus]}</span>
            <span>{formatKoreanDate(baseDateOf(rep))}</span>
            {seasonLabel(rep) && <span>{seasonLabel(rep)}</span>}
            {group.contentProvider && <span>{group.contentProvider}</span>}
          </div>
          <div className="record-rating-row">
            <Stars rating={rep.review?.rating ?? null} />
            {edited && <span className="edited-badge">{edited}</span>}
          </div>
          {rep.review?.shortComment && <p className="record-comment">“{rep.review.shortComment}”</p>}
          {(rep.pickedContext || rep.pickedMood) && (
            <p className="record-pick-context">
              {[rep.pickedContext, rep.pickedMood].filter(Boolean).join(" · ")} 상황에서 골랐어요
            </p>
          )}
        </div>

        <span className="record-toggle" aria-hidden="true">
          {open ? "▲" : "▼"}
        </span>
      </button>

      {open && (
        <div className="record-detail">
          <h3>전체 기록 {group.records.length}건</h3>
          <ul>
            {group.records.map((record) => {
              const recordEdited = editedLabelOf(record);
              return (
                <li key={record.id}>
                  <div className="record-detail-main">
                    <div className="record-meta">
                      <span>{WATCH_STATUS_LABEL[record.watchStatus]}</span>
                      <span>{formatKoreanDate(baseDateOf(record))}</span>
                      {seasonLabel(record) && <span>{seasonLabel(record)}</span>}
                      {record.watchMode && <span>{record.watchMode === "together" ? "같이 봄" : "혼자 봄"}</span>}
                    </div>
                    <Stars rating={record.review?.rating ?? null} />
                    {recordEdited && <span className="edited-badge">{recordEdited}</span>}
                    {record.review?.shortComment && <p className="record-comment">“{record.review.shortComment}”</p>}
                    {record.memo && <p className="record-memo">메모 · {record.memo}</p>}
                  </div>
                  <div className="record-detail-actions">
                    <button type="button" onClick={() => onEdit(record)}>
                      수정
                    </button>
                    <button type="button" className="danger" onClick={() => onDelete(record)}>
                      삭제
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </article>
  );
}
