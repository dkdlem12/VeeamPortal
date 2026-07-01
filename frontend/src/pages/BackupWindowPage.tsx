import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { ChevronLeft, ChevronRight, GanttChart } from 'lucide-react';
import SessionDetailModal from '../components/common/SessionDetailModal';
import { getJobHistory } from '../api/history';
import { getDashboardSummary } from '../api/dashboard';
import type { BackupJob, JobStatus } from '../types';
import { format, addDays, subDays, startOfDay } from 'date-fns';

/** 픽셀/분 — 값이 클수록 타임라인이 가로로 넓어진다(10분=PX_PER_MIN*10px). */
const PX_PER_MIN = 4;
const HOUR_MS = 3_600_000;
const MIN_MS = 60_000;
const HEADER_H = 40;
const ROW_H = 40;
const BAR_H = 20;
const HOURS = Array.from({ length: 24 }, (_, i) => i);
const hourLabel = (h: number) => `${String(h).padStart(2, '0')}:00`;

/** 상태별 막대 색 (StatusBadge 팔레트와 동일 계열) */
const STATUS_BAR: Record<string, string> = {
  Success: 'bg-green-500',
  Failed: 'bg-red-500',
  Warning: 'bg-amber-400',
  Running: 'bg-blue-500',
  None: 'bg-gray-400',
};

const STATUS_LEGEND: { status: JobStatus; label: string }[] = [
  { status: 'Success', label: '성공' },
  { status: 'Failed', label: '실패' },
  { status: 'Warning', label: '경고' },
  { status: 'Running', label: '진행중' },
];

function fmtDuration(sec: number | null) {
  if (!sec) return '-';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h > 0) return `${h}시간 ${m}분`;
  return `${m}분`;
}

export default function BackupWindowPage() {
  const { t } = useTranslation();
  const [day, setDay] = useState<Date>(startOfDay(new Date()));
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const dayTouched = useRef(false);
  // 대상 서버 열 너비(px). null 이면 이름 길이에 맞춰 자동 산정, 드래그하면 사용자 값 고정.
  const [leftW, setLeftW] = useState<number | null>(null);
  // 표(타임라인) 영역 높이(px). null 이면 내용에 맞춰 자동, 드래그하면 사용자 값 고정.
  const [tableH, setTableH] = useState<number | null>(null);
  // 표시 시간 범위(정시 단위). 기본: 조회일 18시 ~ 익일 09시.
  const [startHour, setStartHour] = useState(18);
  const [endHour, setEndHour] = useState(9);

  // 종료 시각이 시작 시각 이하이면 다음날로 넘어간 것으로 본다(야간 윈도우).
  const { windowStart, windowEnd } = useMemo(() => {
    const ws = startOfDay(day);
    ws.setHours(startHour, 0, 0, 0);
    const we = startOfDay(day);
    we.setHours(endHour, 0, 0, 0);
    if (endHour <= startHour) we.setDate(we.getDate() + 1);
    return { windowStart: ws, windowEnd: we };
  }, [day, startHour, endHour]);

  // 사용자가 날짜를 직접 고르기 전까지는 데이터가 있는 최신일(대시보드 lastUpdated)로 맞춘다.
  const { data: summary } = useQuery({ queryKey: ['dashboard-summary'], queryFn: getDashboardSummary });
  useEffect(() => {
    if (!dayTouched.current && summary?.lastUpdated) {
      setDay(startOfDay(new Date(summary.lastUpdated)));
    }
  }, [summary]);

  const pickDay = (d: Date) => {
    dayTouched.current = true;
    setDay(startOfDay(d));
  };

  const { data, isLoading } = useQuery({
    queryKey: ['backup-window', format(windowStart, 'yyyy-MM-dd'), format(windowEnd, 'yyyy-MM-dd')],
    queryFn: () =>
      getJobHistory({
        // 윈도우가 자정을 넘으면 익일에 시작한 잡까지 포함되도록 종료일까지 조회
        startDate: windowStart,
        endDate: windowEnd,
        jobType: '',
        status: '',
        jobName: '',
        server: '',
        page: 1,
        pageSize: 200,
      }),
  });

  const jobs: BackupJob[] = data?.items ?? [];

  const model = useMemo(() => {
    // 시간 도메인 = 사용자가 선택한 표시 범위(정시 경계)
    const domainStart = windowStart.getTime();
    const domainEnd = windowEnd.getTime();
    const totalMin = (domainEnd - domainStart) / MIN_MS;
    const width = totalMin * PX_PER_MIN;

    // 선택한 시간 범위와 겹치는 잡만 표시
    const valid = jobs.filter((j) => {
      if (!j.startTime) return false;
      const s = new Date(j.startTime).getTime();
      const e = j.endTime ? new Date(j.endTime).getTime() : Math.max(s + 5 * MIN_MS, Date.now());
      return e > domainStart && s < domainEnd;
    });
    if (valid.length === 0) return null;

    // Y축: 대상 서버별 그룹 (없으면 Job 이름으로 대체)
    const serverMap = new Map<string, BackupJob[]>();
    for (const j of valid) {
      const key = j.server?.trim() || j.name || '-';
      if (!serverMap.has(key)) serverMap.set(key, []);
      serverMap.get(key)!.push(j);
    }
    const servers = [...serverMap.keys()].sort((a, b) => a.localeCompare(b));

    // 격자선: 정시(실선) / 10분(점선), 자정 경계(익일 구분)
    const hourMarks: { left: number; label: string }[] = [];
    const tenMarks: number[] = [];
    const dayBoundaries: { left: number; label: string }[] = [];
    for (let t = domainStart; t <= domainEnd; t += 10 * MIN_MS) {
      const left = ((t - domainStart) / MIN_MS) * PX_PER_MIN;
      if ((t - domainStart) % HOUR_MS === 0) {
        const dt = new Date(t);
        hourMarks.push({ left, label: format(dt, 'HH:mm') });
        // 자정(00:00)이면서 시작점이 아니면 → 날짜가 바뀌는 익일 경계
        if (dt.getHours() === 0 && dt.getMinutes() === 0 && t !== domainStart) {
          dayBoundaries.push({ left, label: format(dt, 'MM-dd') });
        }
      } else {
        tenMarks.push(left);
      }
    }
    // 첫 자정 이후 구간 = 익일 영역 (배경 음영용)
    const nextDayLeft = dayBoundaries.length ? dayBoundaries[0].left : null;

    const toX = (t: number) => ((t - domainStart) / MIN_MS) * PX_PER_MIN;

    return { servers, serverMap, width, hourMarks, tenMarks, dayBoundaries, nextDayLeft, toX, domainStart, domainEnd };
  }, [jobs, windowStart, windowEnd]);

  // 대상 서버 이름이 잘리지 않도록 가장 긴 이름 기준으로 열 너비 자동 산정
  const autoLeftW = useMemo(() => {
    const names = model?.servers ?? [];
    const longest = names.reduce((m, s) => Math.max(m, s.length), 8);
    return Math.min(520, Math.max(160, Math.round(longest * 8.4) + 44));
  }, [model]);
  const effLeftW = leftW ?? autoLeftW;

  // 내용에 맞춘 기본 표 높이 (헤더 + 행), 최대 720px
  const contentH = model ? HEADER_H + model.servers.length * ROW_H + 2 : 0;
  const effTableH = tableH ?? Math.min(contentH, 720);

  // 드래그 리사이즈 공통 로직
  const startDrag = (
    axis: 'x' | 'y',
    from: number,
    apply: (delta: number) => void,
  ) => (e: React.MouseEvent) => {
    e.preventDefault();
    const origin = axis === 'x' ? e.clientX : e.clientY;
    const onMove = (ev: MouseEvent) => apply((axis === 'x' ? ev.clientX : ev.clientY) - origin + from);
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };
    document.body.style.userSelect = 'none';
    document.body.style.cursor = axis === 'x' ? 'col-resize' : 'row-resize';
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  const startColResize = startDrag('x', effLeftW, (w) => setLeftW(Math.max(120, Math.min(640, w))));
  const startRowResize = startDrag('y', effTableH, (h) => setTableH(Math.max(140, h)));

  return (
    <>
      <div className="space-y-5">
        {/* 헤더 */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <GanttChart className="text-[#1B6CA8]" size={24} />
            <h1 className="text-2xl font-bold text-gray-900">{t('backupWindow.title')}</h1>
          </div>

          {/* 날짜 이동 */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => pickDay(subDays(day, 1))}
              className="p-1.5 rounded border border-gray-200 hover:bg-gray-50 transition-colors"
              aria-label="이전 날짜"
            >
              <ChevronLeft size={16} />
            </button>
            <DatePicker
              selected={day}
              onChange={(d: Date | null) => d && pickDay(d)}
              dateFormat="yyyy-MM-dd (EEE)"
              className="w-40 text-center border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={() => pickDay(addDays(day, 1))}
              className="p-1.5 rounded border border-gray-200 hover:bg-gray-50 transition-colors"
              aria-label="다음 날짜"
            >
              <ChevronRight size={16} />
            </button>
            <button
              onClick={() => pickDay(new Date())}
              className="ml-1 px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 text-sm hover:bg-gray-50 transition-colors"
            >
              {t('backupWindow.today')}
            </button>
          </div>
        </div>

        {/* 표시 시간 범위 선택 */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-medium text-gray-500 mr-1">{t('backupWindow.displayRange')}</span>
          <select
            value={startHour}
            onChange={(e) => setStartHour(Number(e.target.value))}
            className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {HOURS.map((h) => (
              <option key={h} value={h}>{hourLabel(h)}</option>
            ))}
          </select>
          <span className="text-gray-400">~</span>
          <select
            value={endHour}
            onChange={(e) => setEndHour(Number(e.target.value))}
            className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {HOURS.map((h) => (
              <option key={h} value={h}>{hourLabel(h)}</option>
            ))}
          </select>
          {endHour <= startHour && (
            <span className="text-[11px] font-semibold text-indigo-600 bg-indigo-50 rounded px-1.5 py-0.5">
              {t('backupWindow.nextDay')}
            </span>
          )}
          <button
            onClick={() => { setStartHour(18); setEndHour(9); }}
            className="ml-1 px-2.5 py-1.5 rounded-lg border border-gray-200 text-gray-600 text-xs hover:bg-gray-50 transition-colors"
          >
            {t('backupWindow.resetRange')}
          </button>
        </div>

        {/* 범례 */}
        <div className="flex items-center gap-5 flex-wrap text-xs text-gray-500">
          <div className="flex items-center gap-3">
            {STATUS_LEGEND.map((s) => (
              <span key={s.status} className="flex items-center gap-1.5">
                <span className={`w-3 h-3 rounded-sm ${STATUS_BAR[s.status]}`} />
                {s.label}
              </span>
            ))}
          </div>
          <span className="h-3 w-px bg-gray-200" />
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-5 border-t-2 border-gray-400" /> {t('backupWindow.hourLine')}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-5 border-t border-dashed border-gray-300" /> {t('backupWindow.tenMinLine')}
          </span>
        </div>

        {/* 타임라인 */}
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          {isLoading ? (
            <div className="p-12 text-center text-gray-400 text-sm">{t('common.loading')}</div>
          ) : !model ? (
            <div className="p-12 text-center text-gray-400 text-sm">{t('common.noData')}</div>
          ) : (
            <>
            <div className="overflow-auto" style={{ height: effTableH }}>
              <div className="flex" style={{ minWidth: effLeftW + model.width }}>
                {/* Y축: 대상 서버 (좌측 고정) */}
                <div
                  className="relative sticky left-0 z-20 bg-white border-r border-gray-200 shrink-0"
                  style={{ width: effLeftW }}
                >
                  <div
                    className="flex items-center px-3 text-xs font-semibold text-gray-500 uppercase tracking-wide border-b border-gray-100 bg-gray-50"
                    style={{ height: HEADER_H }}
                  >
                    {t('backupWindow.targetServer')}
                  </div>
                  {model.servers.map((s, i) => (
                    <div
                      key={s}
                      className={`flex items-center px-3 text-sm text-gray-700 font-mono whitespace-nowrap ${
                        i % 2 ? 'bg-gray-50/50' : ''
                      }`}
                      style={{ height: ROW_H }}
                      title={s}
                    >
                      {s}
                    </div>
                  ))}
                  {/* 열 너비 조절 핸들 (드래그) */}
                  <div
                    onMouseDown={startColResize}
                    className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize bg-transparent hover:bg-[#1B6CA8]/30 z-30"
                    title="대상 서버 열 너비 조절"
                  />
                </div>

                {/* X축 + 막대 영역 */}
                <div className="relative shrink-0" style={{ width: model.width }}>
                  {/* 시간 눈금 헤더 */}
                  <div className="relative border-b border-gray-100 bg-gray-50" style={{ height: HEADER_H }}>
                    {model.hourMarks.map((m) => (
                      <div
                        key={m.left}
                        className="absolute top-0 flex items-start pt-1"
                        style={{ left: m.left, transform: 'translateX(-50%)' }}
                      >
                        <span className="text-[11px] font-medium text-gray-500 tabular-nums px-1 bg-gray-50">
                          {m.label}
                        </span>
                      </div>
                    ))}
                    {/* 익일 경계 날짜 라벨 */}
                    {model.dayBoundaries.map((d) => (
                      <div
                        key={`db${d.left}`}
                        className="absolute bottom-0.5"
                        style={{ left: d.left, transform: 'translateX(3px)' }}
                      >
                        <span className="text-[10px] font-semibold text-indigo-600 bg-indigo-50 rounded px-1 py-0.5 whitespace-nowrap">
                          {t('backupWindow.nextDay')} {d.label}
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* 격자 + 막대 본문 */}
                  <div className="relative" style={{ height: model.servers.length * ROW_H }}>
                    {/* 익일 영역 음영 */}
                    {model.nextDayLeft !== null && (
                      <div
                        className="absolute top-0 bottom-0 bg-indigo-50/40"
                        style={{ left: model.nextDayLeft, width: model.width - model.nextDayLeft }}
                      />
                    )}
                    {/* 10분 점선 */}
                    {model.tenMarks.map((left) => (
                      <div
                        key={`t${left}`}
                        className="absolute top-0 bottom-0 border-l border-dashed border-gray-200"
                        style={{ left }}
                      />
                    ))}
                    {/* 정시 실선 */}
                    {model.hourMarks.map((m) => (
                      <div
                        key={`h${m.left}`}
                        className="absolute top-0 bottom-0 border-l border-gray-300"
                        style={{ left: m.left }}
                      />
                    ))}
                    {/* 자정(익일) 경계 — 굵은 실선 */}
                    {model.dayBoundaries.map((d) => (
                      <div
                        key={`bl${d.left}`}
                        className="absolute top-0 bottom-0 border-l-2 border-indigo-400"
                        style={{ left: d.left }}
                      />
                    ))}
                    {/* 행 배경 줄무늬 */}
                    {model.servers.map((s, i) => (
                      <div
                        key={`r${s}`}
                        className={`absolute left-0 right-0 ${i % 2 ? 'bg-gray-50/50' : ''}`}
                        style={{ top: i * ROW_H, height: ROW_H }}
                      />
                    ))}

                    {/* 막대 */}
                    {model.servers.map((s, rowIdx) =>
                      model.serverMap.get(s)!.map((job) => {
                        const start = new Date(job.startTime).getTime();
                        const end = job.endTime
                          ? new Date(job.endTime).getTime()
                          : Math.max(start + 5 * MIN_MS, Date.now());
                        // 표시 범위를 벗어난 부분은 잘라서 그린다
                        const clipL = Math.max(start, model.domainStart);
                        const clipR = Math.min(end, model.domainEnd);
                        const left = model.toX(clipL);
                        const width = Math.max(3, model.toX(clipR) - left);
                        const color = STATUS_BAR[job.status] ?? STATUS_BAR.None;
                        const startLabel = format(new Date(start), 'HH:mm');
                        const endLabel = job.endTime ? format(new Date(end), 'HH:mm') : '진행중';
                        return (
                          <div
                            key={job.id}
                            onClick={() => setSelectedSessionId(job.id)}
                            title={`${job.name}\n${startLabel} ~ ${endLabel} (${fmtDuration(job.duration)})\n${job.status}`}
                            className={`absolute rounded ${color} ${
                              job.status === 'Running' ? 'opacity-80 animate-pulse' : ''
                            } cursor-pointer hover:ring-2 hover:ring-offset-1 hover:ring-[#1B6CA8] flex items-center overflow-hidden`}
                            style={{
                              left,
                              width,
                              top: rowIdx * ROW_H + (ROW_H - BAR_H) / 2,
                              height: BAR_H,
                            }}
                          >
                            {width > 54 && (
                              <span className="px-1.5 text-[10px] font-medium text-white whitespace-nowrap tabular-nums">
                                {startLabel}~{endLabel}
                              </span>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>
            </div>
            {/* 표 높이 조절 핸들 (드래그) */}
            <div
              onMouseDown={startRowResize}
              className="h-2.5 cursor-row-resize border-t border-gray-100 bg-gray-50 hover:bg-[#1B6CA8]/20 flex items-center justify-center"
              title="표 높이 조절"
            >
              <div className="w-10 h-1 rounded-full bg-gray-300" />
            </div>
            </>
          )}

          {/* 요약 */}
          {model && (
            <div className="px-5 py-3 border-t border-gray-100 text-xs text-gray-400">
              {t('backupWindow.targetServer')}{' '}
              <span className="font-bold text-gray-600">{model.servers.length}</span>
              {' · '}
              {t('common.total')} <span className="font-bold text-gray-600">{jobs.length}</span>
              {t('common.items')}
              {'  ·  '}
              {format(new Date(model.domainStart), 'MM-dd HH:mm')} ~ {format(new Date(model.domainEnd), 'MM-dd HH:mm')}
            </div>
          )}
        </div>
      </div>

      {selectedSessionId && (
        <SessionDetailModal
          sessionId={selectedSessionId}
          onClose={() => setSelectedSessionId(null)}
        />
      )}
    </>
  );
}
