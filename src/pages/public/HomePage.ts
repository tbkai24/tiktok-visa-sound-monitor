import { renderFooter } from "../../components/layout/Footer";
import { renderNavbar } from "../../components/layout/Navbar";
import { applyAppSettingsToLayout, DEFAULT_APP_SETTINGS, toAppSettings } from "../../lib/appSettings";
import { supabase, supabaseConfigError } from "../../lib/supabase";

type VideoRow = {
  video_id: string;
  video_url: string | null;
  title: string | null;
  thumbnail_url: string | null;
  creator_username: string | null;
  creator_followers: number | null;
  creator_size: string | null;
  posted_at: string | null;
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  favorites: number | null;
  engagement_total: number | null;
  engagement_rate: number | null;
};

type SoundStatsRow = {
  sound_id: string;
  total_posts: number;
  total_posts_global?: number | null;
  captured_at?: string | null;
};

type SoundStatsHistoryRow = {
  sound_id: string;
  total_posts_global: number;
  captured_at: string;
};

type SnapshotRow = {
  sound_id: string;
  captured_at: string;
};

type AnalyticsRange = "1d" | "3d" | "7d" | "30d" | "custom"; 
type BigCreatorSort = "followers_desc" | "followers_asc";
type AnalyticsRow = [string, number, number]; 
type MilestoneRow = {
  id: string;
  title: string;
  target_posts: number;
  sort_order: number;
  is_active: boolean;
};

const formatNumber = (value: number) => value.toLocaleString();
const PAGE_SIZE = 10;
const LAST_TOTAL_KEY = "tt-last-total-posts";
const DISMISSED_TARGETS_KEY = "tt-dismissed-milestone-targets";
const MANILA_TIMEZONE = "Asia/Manila";
const ANALYTICS_RANGE_OPTIONS: Array<{ value: AnalyticsRange; label: string }> = [
  { value: "1d", label: "Last 1 day" },
  { value: "3d", label: "Last 3 days" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "custom", label: "Custom range" },
];

const getRangeStart = (range: AnalyticsRange) => {
  const now = Date.now();
  if (range === "1d") return now - 24 * 60 * 60 * 1000;
  if (range === "3d") return now - 3 * 24 * 60 * 60 * 1000;
  if (range === "7d") return now - 7 * 24 * 60 * 60 * 1000;
  if (range === "custom") return null;
  return now - 30 * 24 * 60 * 60 * 1000;
};

const toDateKeyInTimezone = (value: string | number | Date, timeZone: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  if (!year || !month || !day) return null;
  return `${year}-${month}-${day}`;
};

const escapeHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const formatCompact = (value: number) => {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return String(value);
};

const formatPosted = (iso: string | null) => {
  if (!iso) return "-";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
};

const parseDismissedTargets = () => {
  try {
    const raw = window.localStorage.getItem(DISMISSED_TARGETS_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? parsed.filter((v) => typeof v === "number") : [];
  } catch {
    return [];
  }
};

const makeThumb = (video: VideoRow) => {
  const url = (video.video_url ?? "").trim();
  const thumb = (video.thumbnail_url ?? "").trim();
  const creator = (video.creator_username ?? "video").replace(/^@/, "");
  const safeAlt = escapeHtml(video.creator_username ?? "video");
  const fallback = `https://placehold.co/120x68/111833/9fb2ff?text=%40${encodeURIComponent(creator)}`;
  const image = thumb || fallback;
  const href = url || "#";
  const target = url ? 'target="_blank" rel="noreferrer"' : "";
  return `<a class="video-thumb-link" ${target} href="${escapeHtml(href)}"><img class="video-thumb" src="${escapeHtml(
    image,
  )}" alt="${safeAlt} thumbnail" /></a>`;
};

const makeCreatorLink = (creatorRaw: string | null) => {
  const creator = (creatorRaw ?? "").trim() || "@unknown";
  const cleaned = creator.replace(/^@+/, "");
  if (!cleaned) return escapeHtml(creator);
  const href = `https://www.tiktok.com/@${encodeURIComponent(cleaned)}`;
  return `<a class="video-link" href="${href}" target="_blank" rel="noreferrer">@${escapeHtml(cleaned)}</a>`;
};

const setupPager = (tbodyId: string) => {
  const tbody = document.getElementById(tbodyId) as HTMLTableSectionElement | null;
  const pager = document.querySelector<HTMLElement>(`.pager[data-target="${tbodyId}"]`);
  if (!tbody || !pager) return;

  const allRows = Array.from(tbody.querySelectorAll("tr")); 
  const pinnedRows = allRows.filter((row) => row.classList.contains("latest-change-row"));
  const rows = allRows.filter((row) => !row.classList.contains("latest-change-row"));
  const prev = pager.querySelector<HTMLButtonElement>(".prev");
  const next = pager.querySelector<HTMLButtonElement>(".next");
  const info = pager.querySelector<HTMLElement>(".pager-info");
  if (!prev || !next || !info) return;

  let page = 1;
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));

  const renderPage = () => {
    const start = (page - 1) * PAGE_SIZE; 
    const end = start + PAGE_SIZE; 
    rows.forEach((row, index) => { 
      row.style.display = index >= start && index < end ? "" : "none"; 
    }); 
    pinnedRows.forEach((row) => {
      row.style.display = "";
    });
    info.textContent = `Page ${page} of ${totalPages}`; 
    prev.disabled = page === 1;
    next.disabled = page === totalPages;
  };

  const prevClone = prev.cloneNode(true) as HTMLButtonElement;
  const nextClone = next.cloneNode(true) as HTMLButtonElement;
  prev.replaceWith(prevClone);
  next.replaceWith(nextClone);

  prevClone.addEventListener("click", () => {
    if (page > 1) {
      page -= 1;
      renderPage();
    }
  });
  nextClone.addEventListener("click", () => {
    if (page < totalPages) {
      page += 1;
      renderPage();
    }
  });

  renderPage();
};

export const renderHomePage = (root: HTMLDivElement) => {
  root.innerHTML = `
    <div class="app-shell">
      ${renderNavbar()}
      <main class="main-wrap">
        <section id="panel-overview" class="tab-panel active">
          <div class="kpi-grid">
            <article class="glass-card hero">
              <p class="muted">All-Time Posts Using Visa Sounds</p>
              <h2 id="kpi-all-time">0</h2>
              <p class="up" id="kpi-all-time-delta">+0 today</p>
            </article>
            <article class="glass-card"><p class="muted">Posts Today</p><h3 id="kpi-posts-today">0</h3><p class="up" id="kpi-posts-delta">+0 vs yesterday</p></article>
            <article class="glass-card"><p class="muted">7-Day Avg</p><h3 id="kpi-avg-7d">0/day</h3><p class="muted">rolling window</p></article>
            <article class="glass-card"><p class="muted">Unique Creators (30d)</p><h3 id="kpi-creators">0</h3><p class="up">live data</p></article>
          </div>
          <div class="split-grid">
            <article class="glass-card"><div class="row-head"><h3>Daily Increase of Posts</h3><span class="pill">Last 14 days</span></div><div class="bars" id="daily-bars"></div></article>
            <article class="glass-card"><div class="row-head"><h3>Milestone</h3><span class="pill">All Time</span></div><p class="muted" id="next-milestone-label">Next milestone</p><h3 id="next-milestone-progress">0.0% complete</h3><div class="progress"><span id="next-milestone-bar" style="width:0%"></span></div><p class="muted" id="next-milestone-remaining">Remaining: 0 posts</p></article>
          </div>
          <article class="glass-card table-wrap"> 
            <div class="row-head"> 
              <h3>Analytics</h3> 
              <div class="analytics-controls"> 
                <span id="analytics-live" class="pill">Live total: 0</span> 
                <select id="analytics-range" class="select"> 
                  ${ANALYTICS_RANGE_OPTIONS.map((option) => `<option value="${option.value}"${ 
                    option.value === "1d" ? " selected" : "" 
                  }>${option.label}</option>`).join("")} 
                </select> 
              </div>
            </div>
            <div id="analytics-custom-range" style="display:none;gap:8px;align-items:center;margin-bottom:8px;flex-wrap:wrap;">
              <label class="muted" for="analytics-start-date">Start</label>
              <input id="analytics-start-date" type="date" class="select" />
              <label class="muted" for="analytics-end-date">End</label>
              <input id="analytics-end-date" type="date" class="select" />
            </div>
            <table><thead><tr><th>Date</th><th>Posts</th><th>+/-</th></tr></thead><tbody id="daily-analytics-rows"></tbody></table> 
            <div class="pager" data-target="daily-analytics-rows"><button type="button" class="pager-btn prev">Prev</button><span class="pager-info">Page 1</span><button type="button" class="pager-btn next">Next</button></div> 
          </article> 
        </section>
        <section id="panel-videos" class="tab-panel">
          <div class="subtabs">
            <button type="button" class="subtab active" data-video-tab="viral">Viral</button>
            <button type="button" class="subtab" data-video-tab="rising">Rising</button>
            <button type="button" class="subtab" data-video-tab="new">New</button>
            <button type="button" class="subtab" data-video-tab="big">Big Creator</button>
          </div>
          <article id="video-panel-viral" class="glass-card table-wrap video-panel active"> 
            <div class="row-head"><h3>Top Viral Videos</h3><span class="pill">By views</span></div> 
            <table> 
              <thead><tr><th>#</th><th>Date</th><th>Video</th><th>Creator</th><th>Followers</th><th>Views</th><th>Likes</th><th>Comments</th><th>Shares</th></tr></thead> 
              <tbody id="viral-rows"></tbody> 
            </table> 
            <div class="pager" data-target="viral-rows"><button type="button" class="pager-btn prev">Prev</button><span class="pager-info">Page 1</span><button type="button" class="pager-btn next">Next</button></div>
          </article>
          <article id="video-panel-rising" class="glass-card table-wrap video-panel"> 
            <div class="row-head"><h3>Rising Videos</h3><span class="pill">By engagement rate</span></div> 
            <table> 
              <thead><tr><th>#</th><th>Date</th><th>Video</th><th>Creator</th><th>Followers</th><th>ER</th><th>Trend</th><th>Status</th></tr></thead> 
              <tbody id="rising-rows"></tbody> 
            </table> 
            <div class="pager" data-target="rising-rows"><button type="button" class="pager-btn prev">Prev</button><span class="pager-info">Page 1</span><button type="button" class="pager-btn next">Next</button></div>
          </article>
          <article id="video-panel-new" class="glass-card table-wrap video-panel">
            <div class="row-head"><h3>Newest Videos</h3><span class="pill">By posted date</span></div>
            <table>
              <thead><tr><th>Posted At</th><th>Video</th><th>Creator</th><th>Views</th><th>Likes</th><th>Comments</th><th>Shares</th></tr></thead>
              <tbody id="new-rows"></tbody>
            </table>
            <div class="pager" data-target="new-rows"><button type="button" class="pager-btn prev">Prev</button><span class="pager-info">Page 1</span><button type="button" class="pager-btn next">Next</button></div>
          </article>
          <article id="video-panel-big" class="glass-card table-wrap video-panel"> 
            <div class="row-head">
              <h3>Big Creators</h3>
              <div class="analytics-controls">
                <span class="pill">50k+ followers</span>
                <select id="big-creator-sort" class="select">
                  <option value="followers_desc" selected>Biggest to Lowest</option>
                  <option value="followers_asc">Lowest to Biggest</option>
                </select>
              </div>
            </div> 
            <table> 
              <thead><tr><th>Date</th><th>Creator</th><th>Video</th><th>Followers</th><th>Views</th><th>Likes</th><th>Comments</th><th>Shares</th></tr></thead> 
              <tbody id="big-creators-rows"></tbody> 
            </table> 
            <div class="pager" data-target="big-creators-rows"><button type="button" class="pager-btn prev">Prev</button><span class="pager-info">Page 1</span><button type="button" class="pager-btn next">Next</button></div>
          </article>
        </section>
        <section id="panel-milestones" class="tab-panel">
          <article class="glass-card table-wrap milestone-progress-panel">
            <div class="row-head"><h3>Milestone Progress</h3><span class="pill">Targets</span></div>
            <table>
              <thead><tr><th>Milestone</th><th>Target</th><th>Current</th><th>Progress</th><th>Remaining</th></tr></thead>
              <tbody id="milestone-rows"></tbody>
            </table>
            <div class="pager" data-target="milestone-rows"><button type="button" class="pager-btn prev">Prev</button><span class="pager-info">Page 1</span><button type="button" class="pager-btn next">Next</button></div>
          </article>
          <div class="milestone-grid" id="milestone-cards"></div>
        </section>
      </main> 
      ${renderFooter()}
    </div>
  `;

  const navLinks = document.querySelectorAll<HTMLButtonElement>(".nav-link");
  const panels = document.querySelectorAll<HTMLElement>(".tab-panel");
  navLinks.forEach((button) => {
    button.addEventListener("click", () => {
      const selected = button.dataset.tab;
      navLinks.forEach((item) => item.classList.toggle("active", item === button));
      panels.forEach((panel) => panel.classList.remove("active"));
      const section = document.querySelector<HTMLElement>(`#panel-${selected}`);
      if (section) section.classList.add("active");
    });
  });

  const videoSubtabs = document.querySelectorAll<HTMLButtonElement>(".subtab");
  const videoPanels = document.querySelectorAll<HTMLElement>(".video-panel");
  videoSubtabs.forEach((button) => { 
    button.addEventListener("click", () => {
      const selected = button.dataset.videoTab;
      if (!selected) return;
      videoSubtabs.forEach((item) => item.classList.toggle("active", item === button));
      videoPanels.forEach((panel) => panel.classList.remove("active"));
      const panel = document.getElementById(`video-panel-${selected}`);
      if (panel) panel.classList.add("active"); 
    }); 
  }); 

  let bigCreatorSort: BigCreatorSort = "followers_desc";
  let latestVideosRows: VideoRow[] = [];
  const bigCreatorSortSelect = document.getElementById("big-creator-sort") as HTMLSelectElement | null;
  bigCreatorSortSelect?.addEventListener("change", (event) => {
    bigCreatorSort = (event.currentTarget as HTMLSelectElement).value as BigCreatorSort;
    renderVideos(latestVideosRows);
  });
 
  let analyticsRange: AnalyticsRange = "1d";  
  let customStartDate: string | null = null; 
  let customEndDate: string | null = null; 
  let latestHistoryRows: SoundStatsHistoryRow[] = []; 
  let latestSnapshotRows: SnapshotRow[] = []; 
  let latestCurrentStatsRows: SoundStatsRow[] = [];
  let latestAllTimePosts = 0;
  const refreshOverviewDaily = () => { 
    renderOverviewDaily( 
      latestHistoryRows, 
      latestSnapshotRows, 
      latestCurrentStatsRows,
      analyticsRange,
      customStartDate,
      customEndDate,
      latestAllTimePosts,
    ); 
  }; 
  const analyticsRangeSelect = document.getElementById("analytics-range") as HTMLSelectElement | null;
  const customRangeWrap = document.getElementById("analytics-custom-range") as HTMLDivElement | null;
  const customStartInput = document.getElementById("analytics-start-date") as HTMLInputElement | null;
  const customEndInput = document.getElementById("analytics-end-date") as HTMLInputElement | null;
  analyticsRangeSelect?.addEventListener("change", (event) => {
    const value = (event.currentTarget as HTMLSelectElement).value as AnalyticsRange;
    analyticsRange = value;
    if (customRangeWrap) {
      customRangeWrap.style.display = analyticsRange === "custom" ? "flex" : "none";
    }
    refreshOverviewDaily();
  });
  customStartInput?.addEventListener("change", (event) => {
    customStartDate = (event.currentTarget as HTMLInputElement).value || null;
    refreshOverviewDaily();
  });
  customEndInput?.addEventListener("change", (event) => {
    customEndDate = (event.currentTarget as HTMLInputElement).value || null;
    refreshOverviewDaily();
  });

  const renderMilestones = (allTimePosts: number, milestones: MilestoneRow[]) => {
    const targets = milestones.map((row) => ({
      label: row.title,
      target: row.target_posts,
    }));
    const targetRows = document.querySelector<HTMLTableSectionElement>("#milestone-rows");
    const targetCards = document.querySelector<HTMLElement>("#milestone-cards");
    if (!targetRows || !targetCards) return;
    if (!targets.length) {
      targetCards.innerHTML = `<article class="glass-card"><p class="muted">No milestones configured in DB.</p></article>`;
      targetRows.innerHTML = `<tr><td colspan="5" class="muted">No milestone targets yet.</td></tr>`;
      setupPager("milestone-rows");
      const nextLabel = document.getElementById("next-milestone-label");
      const nextProgressLabel = document.getElementById("next-milestone-progress");
      const nextBar = document.getElementById("next-milestone-bar");
      const nextRemainingLabel = document.getElementById("next-milestone-remaining");
      if (nextLabel) nextLabel.textContent = "Next milestone: not configured";
      if (nextProgressLabel) nextProgressLabel.textContent = "0.0% complete";
      if (nextBar) (nextBar as HTMLElement).style.width = "0%";
      if (nextRemainingLabel) nextRemainingLabel.textContent = "Remaining: 0 posts";
      return;
    }
    targetCards.innerHTML = targets
      .map((entry) => {
        const progress = Math.min(100, (allTimePosts / entry.target) * 100);
        const remaining = Math.max(0, entry.target - allTimePosts);
        const reached = remaining === 0;
        return `<article class="glass-card"><p class="muted">${escapeHtml(entry.label)}</p><h3>${progress.toFixed(
          1,
        )}%</h3><div class="progress"><span style="width:${progress.toFixed(1)}%"></span></div><p class="${
          reached ? "up" : "muted"
        }">${
          reached
            ? "Congratulations, milestone reached!"
            : `${formatNumber(remaining)} posts remaining`
        }</p></article>`;
      })
      .join("");
    targetRows.innerHTML = targets
      .map((entry) => {
        const progress = Math.min(100, (allTimePosts / entry.target) * 100);
        const remaining = Math.max(0, entry.target - allTimePosts);
        return `<tr><td>${escapeHtml(entry.label)}</td><td>${formatNumber(
          entry.target,
        )}</td><td>${formatNumber(allTimePosts)}</td><td>${progress.toFixed(1)}%</td><td>${formatNumber(
          remaining,
        )}</td></tr>`;
      })
      .join("");
    setupPager("milestone-rows");
    const nextEntry =
      targets.find((entry) => allTimePosts < entry.target) ?? targets[targets.length - 1];
    const nextProgress = Math.min(100, (allTimePosts / nextEntry.target) * 100);
    const nextRemaining = Math.max(0, nextEntry.target - allTimePosts);
    const nextLabel = document.getElementById("next-milestone-label");
    const nextProgressLabel = document.getElementById("next-milestone-progress");
    const nextBar = document.getElementById("next-milestone-bar");
    const nextRemainingLabel = document.getElementById("next-milestone-remaining");
    if (nextLabel) nextLabel.textContent = `Next milestone: ${nextEntry.label}`;
    if (nextProgressLabel) nextProgressLabel.textContent = `${nextProgress.toFixed(1)}% complete`;
    if (nextBar) (nextBar as HTMLElement).style.width = `${nextProgress.toFixed(1)}%`;
    if (nextRemainingLabel) {
      nextRemainingLabel.textContent =
        nextRemaining === 0
          ? "Congratulations, all milestones reached!"
          : `Remaining: ${formatNumber(nextRemaining)} posts`;
    }
  };

  const maybeShowCongrats = (allTimePosts: number, milestones: MilestoneRow[]) => {
    const targets = milestones.map((row) => row.target_posts).sort((a, b) => a - b);
    if (!targets.length) return;
    const lastTotal = Number(window.localStorage.getItem(LAST_TOTAL_KEY) ?? "0");
    const dismissed = parseDismissedTargets();
    const crossed = targets.filter(
      (target) => lastTotal < target && allTimePosts >= target && !dismissed.includes(target),
    );
    window.localStorage.setItem(LAST_TOTAL_KEY, String(allTimePosts));
    if (!crossed.length) return;

    const target = crossed[crossed.length - 1];
    const existing = document.getElementById("tt-congrats-modal");
    if (existing) existing.remove();
    const modal = document.createElement("div");
    modal.id = "tt-congrats-modal";
    modal.className = "tt-congrats-backdrop";
    modal.innerHTML = `
      <div class="tt-congrats-modal">
        <p class="tt-congrats-emoji">🎉</p>
        <h3>Congratulations!</h3>
        <p class="muted">Visa sound reached</p>
        <p class="tt-congrats-value">${formatNumber(target)} posts</p>
        <button type="button" class="small-btn" id="tt-congrats-close">Close</button>
      </div>
    `;
    document.body.appendChild(modal);
    const closeBtn = document.getElementById("tt-congrats-close");
    closeBtn?.addEventListener("click", () => {
      const next = [...new Set([...dismissed, target])];
      window.localStorage.setItem(DISMISSED_TARGETS_KEY, JSON.stringify(next));
      modal.remove();
    });
  };

  const renderOverviewDaily = ( 
    historyRows: SoundStatsHistoryRow[], 
    snapshots: SnapshotRow[], 
    currentStatsRows: SoundStatsRow[],
    selectedRange: AnalyticsRange, 
    customStart: string | null, 
    customEnd: string | null, 
    allTimeAnchor: number,
  ) => { 
    const byCaptureSound = new Map<string, Map<string, number>>();
    historyRows.forEach((row) => {
      const capturedAt = row.captured_at;
      if (!capturedAt) return;
      const soundId = (row.sound_id ?? "").trim();
      if (!soundId) return;
      const soundMap = byCaptureSound.get(capturedAt) ?? new Map<string, number>();
      const prev = soundMap.get(soundId) ?? 0;
      const next = Number(row.total_posts_global ?? 0);
      soundMap.set(soundId, Math.max(prev, next));
      byCaptureSound.set(capturedAt, soundMap);
    });

    let series = Array.from(byCaptureSound.entries()) 
      .sort((a, b) => new Date(a[0]).getTime() - new Date(b[0]).getTime()) 
      .map(([capturedAt, soundMap]) => ({ 
        capturedAt, 
        total: Array.from(soundMap.values()).reduce((sum, value) => sum + value, 0), 
      })); 

    // Fallback: derive timeline from snapshot capture counts if history table is empty/unreadable.
    if (!series.length && snapshots.length) { 
      const byCaptureCount = new Map<string, number>();
      snapshots.forEach((row) => {
        if (!row.captured_at) return;
        byCaptureCount.set(row.captured_at, (byCaptureCount.get(row.captured_at) ?? 0) + 1);
      });
      let runningTotal = 0;
      series = Array.from(byCaptureCount.entries())
        .sort((a, b) => new Date(a[0]).getTime() - new Date(b[0]).getTime())
        .map(([capturedAt, count]) => {
          runningTotal += count;
          return { capturedAt, total: runningTotal };
        });
    }

    const latestRawTotal = series.length ? series[series.length - 1].total : 0;
    const anchorOffset = Math.max(0, allTimeAnchor - latestRawTotal);
    if (anchorOffset > 0) {
      series = series.map((item) => ({ ...item, total: item.total + anchorOffset }));
    }

    const byDayTotal = new Map<string, number>();
    series.forEach((item) => {
      const day = toDateKeyInTimezone(item.capturedAt, MANILA_TIMEZONE);
      if (!day) return;
      const prev = byDayTotal.get(day) ?? 0;
      byDayTotal.set(day, Math.max(prev, item.total));
    });

    const dayTotals = Array.from(byDayTotal.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([day, total]) => ({ day, total }));

    const dayRows: AnalyticsRow[] = dayTotals.map((item, index) => {
      const prevTotal = index === 0 ? item.total : dayTotals[index - 1].total;
      const added = index === 0 ? item.total : item.total - prevTotal;
      return [item.day, added, item.total];
    });

    const rangeStart = getRangeStart(selectedRange);
    const rangeStartDayKey = rangeStart ? toDateKeyInTimezone(rangeStart, MANILA_TIMEZONE) : null;
    const customStartKey = customStart || null;
    const customEndKey = customEnd || null;

    let rows: AnalyticsRow[] = dayRows;
    if (selectedRange === "custom") {
      rows = rows.filter((item) => {
        const day = item[0];
        if (customStartKey && day < customStartKey) return false;
        if (customEndKey && day > customEndKey) return false;
        return true;
      });
    } else {
      rows = rows.filter((item) => !rangeStartDayKey || item[0] >= rangeStartDayKey);
    }

    const barsRows = dayRows.slice(-14);
    const analyticsLiveEl = document.getElementById("analytics-live");
    const latestSeries = series.length ? series[series.length - 1] : null;

    const currentPoint = (() => {
      const valid = currentStatsRows.filter((row) => !!row.captured_at);
      if (!valid.length) return null;
      const latestTs = valid
        .map((row) => new Date(String(row.captured_at)).getTime())
        .filter((value) => Number.isFinite(value))
        .sort((a, b) => b - a)[0];
      if (!Number.isFinite(latestTs)) return null;
      const total = valid.reduce((sum, row) => {
        const value = Number(row.total_posts_global ?? row.total_posts ?? 0);
        return sum + (Number.isFinite(value) ? value : 0);
      }, 0);
      return {
        capturedAt: new Date(latestTs).toISOString(),
        total,
      };
    })();

    const useCurrentPoint =
      !!currentPoint &&
      (!latestSeries ||
        new Date(currentPoint.capturedAt).getTime() > new Date(latestSeries.capturedAt).getTime());
    const latestPoint = useCurrentPoint ? currentPoint : latestSeries;
    const latestTotal = latestPoint?.total ?? 0;
    const todayKey = toDateKeyInTimezone(Date.now(), MANILA_TIMEZONE);
    const todaySeries = series.filter((item) => toDateKeyInTimezone(item.capturedAt, MANILA_TIMEZONE) === todayKey);
    const dayStartTotal = todaySeries.length ? todaySeries[0].total : latestTotal;
    const latestDelta = (() => {
      if (!latestPoint) return 0;
      if (useCurrentPoint) {
        // Do not mix fallback "current stats" with snapshot-derived series.
        // If we only have current fallback for this capture, show 0 until history has a previous capture.
        return 0;
      }
      const pointsForDelta = [...series].sort(
        (a, b) => new Date(a.capturedAt).getTime() - new Date(b.capturedAt).getTime(),
      );
      for (let i = pointsForDelta.length - 2; i >= 0; i -= 1) {
        if (pointsForDelta[i].total !== latestTotal) {
          return latestTotal - pointsForDelta[i].total;
        }
      }
      return latestPoint ? latestTotal - dayStartTotal : 0;
    })();
    const latestCapturedLabel = latestPoint
      ? new Date(latestPoint.capturedAt).toLocaleString("en-PH", { timeZone: MANILA_TIMEZONE })
      : null;
    if (analyticsLiveEl) {
      analyticsLiveEl.textContent = latestCapturedLabel
        ? `Live total: ${formatNumber(latestTotal)} (${latestCapturedLabel})`
        : `Live total: ${formatNumber(latestTotal)}`;
    }
    const bars = document.getElementById("daily-bars"); 
    if (bars) {
      if (!barsRows.length) bars.innerHTML = `<span style="height:10%"></span>`;
      else {
        const max = Math.max(...barsRows.map((item) => Math.max(0, item[1])));
        bars.innerHTML = barsRows
          .map(([_, count]) => {
            const display = Math.max(0, count);
            return `<span style="height:${Math.max(8, (display / Math.max(1, max)) * 100).toFixed(1)}%"></span>`;
          })
          .join("");
      }
    }
    const table = document.getElementById("daily-analytics-rows");
    if (table) {
      const html = rows 
        .map(([label, count, total]) => { 
          const cls = count >= 0 ? "up" : "down"; 
          return `<tr><td>${label}</td><td>${formatNumber(total)}</td><td class="${cls}">${ 
            count >= 0 ? "+" : "" 
          }${formatNumber(count)}</td></tr>`; 
        }) 
        .join(""); 
      const dailyPrefix = latestDelta >= 0 ? "+" : "-";
      const latestChangeRow = `<tr class="latest-change-row"><td>Latest Change</td><td>${formatNumber(
        latestTotal,
      )}</td><td class="${latestDelta >= 0 ? "up" : "down"}">${dailyPrefix}${formatNumber(
        Math.abs(latestDelta),
      )}</td></tr>`;
      table.innerHTML = html
        ? `${html}${latestChangeRow}`
        : `<tr><td colspan="3" class="muted">No analytics data yet for this range.</td></tr>`; 
      setupPager("daily-analytics-rows"); 
    } 

    const today = toDateKeyInTimezone(Date.now(), MANILA_TIMEZONE);
    const yesterdayDate = toDateKeyInTimezone(Date.now() - 24 * 60 * 60 * 1000, MANILA_TIMEZONE);
    const todayRow = dayRows.find((row) => row[0] === today);
    const yesterdayRow = dayRows.find((row) => row[0] === yesterdayDate);
    const postsToday = todayRow?.[1] ?? 0;
    const postsYesterday = yesterdayRow?.[1] ?? 0;
    const delta = postsToday - postsYesterday;
    const last7 = dayRows.slice(-7);
    const avg7 = last7.length ? last7.reduce((sum, item) => sum + item[1], 0) / last7.length : 0;
    const postsTodayEl = document.getElementById("kpi-posts-today");
    const postsDeltaEl = document.getElementById("kpi-posts-delta");
    const avg7El = document.getElementById("kpi-avg-7d");
    const allTimeDeltaEl = document.getElementById("kpi-all-time-delta");
    if (postsTodayEl) postsTodayEl.textContent = formatNumber(postsToday);
    if (postsDeltaEl) {
      postsDeltaEl.textContent = `${delta >= 0 ? "+" : ""}${formatNumber(delta)} vs yesterday`;
      postsDeltaEl.className = delta >= 0 ? "up" : "down";
    }
    if (avg7El) avg7El.textContent = `${Math.round(avg7)}/day`;
    if (allTimeDeltaEl) allTimeDeltaEl.textContent = `+${formatNumber(postsToday)} today`;
  };

  const renderVideos = (videos: VideoRow[]) => {
    const viralRows = document.getElementById("viral-rows");
    const risingRows = document.getElementById("rising-rows");
    const newRows = document.getElementById("new-rows");
    const bigCreatorsRows = document.getElementById("big-creators-rows");
    if (!viralRows || !risingRows || !newRows || !bigCreatorsRows) return;
    const withDefaults = videos.map((video) => ({
      ...video,
      creator_username: (video.creator_username ?? "").trim() || "@unknown",
      creator_followers: video.creator_followers ?? 0,
      views: video.views ?? 0,
      likes: video.likes ?? 0,
      comments: video.comments ?? 0,
      shares: video.shares ?? 0,
      favorites: video.favorites ?? 0,
      engagement_rate: video.engagement_rate ?? 0,
      engagement_total: video.engagement_total ?? 0,
    }));
    const viral = [...withDefaults].sort((a, b) => (b.views ?? 0) - (a.views ?? 0));
    const rising = [...withDefaults]
      .filter((video) => (video.views ?? 0) >= 5_000)
      .sort((a, b) => (b.engagement_rate ?? 0) - (a.engagement_rate ?? 0));
    const newest = [...withDefaults].sort((a, b) => {
      const av = a.posted_at ? new Date(a.posted_at).getTime() : 0;
      const bv = b.posted_at ? new Date(b.posted_at).getTime() : 0;
      return bv - av;
    });
    viralRows.innerHTML = viral
      .map((video, index) => `<tr><td>#${index + 1}</td><td>${formatPosted(video.posted_at)}</td><td class="video-cell">${makeThumb(video)}</td><td>${makeCreatorLink(
        video.creator_username,
      )}</td><td>${formatCompact(video.creator_followers ?? 0)}</td><td>${formatCompact(
        video.views ?? 0,
      )}</td><td>${formatCompact(video.likes ?? 0)}</td><td>${formatCompact(video.comments ?? 0)}</td><td>${formatCompact(
        video.shares ?? 0,
      )}</td></tr>`)
      .join("");
    risingRows.innerHTML = rising.length
      ? rising
          .map((video, index) => `<tr><td>#${index + 1}</td><td>${formatPosted(video.posted_at)}</td><td class="video-cell">${makeThumb(video)}</td><td>${makeCreatorLink(
            video.creator_username,
          )}</td><td>${formatCompact(video.creator_followers ?? 0)}</td><td>${(
            (video.engagement_rate ?? 0) * 100
          ).toFixed(1)}%</td><td class="up">+${Math.round((video.engagement_rate ?? 0) * 1000)}%</td><td class="up">${
            (video.creator_size ?? "small") === "big" ? "Big creator" : "Rising fast"
          }</td></tr>`)
          .join("")
      : `<tr><td colspan="8" class="muted">No rising videos (min 5,000 views).</td></tr>`;
    newRows.innerHTML = newest
      .map((video) => `<tr><td>${formatPosted(video.posted_at)}</td><td class="video-cell">${makeThumb(video)}</td><td>${makeCreatorLink(
        video.creator_username,
      )}</td><td>${formatCompact(video.views ?? 0)}</td><td>${formatCompact(
        video.likes ?? 0,
      )}</td><td>${formatCompact(video.comments ?? 0)}</td><td>${formatCompact(video.shares ?? 0)}</td></tr>`)
      .join("");

    const bigCreatorsMap = new Map<
      string,
      {
        creator: string;
        topVideo: VideoRow | null;
        followers: number;
        views: number;
        likes: number;
        comments: number;
        shares: number;
      }
    >();
    withDefaults
      .filter((video) => (video.creator_followers ?? 0) >= 50_000)
      .forEach((video) => {
        const creator = video.creator_username ?? "@unknown";
        const current = bigCreatorsMap.get(creator) ?? {
          creator,
          topVideo: null,
          followers: video.creator_followers ?? 0,
          views: 0,
          likes: 0,
          comments: 0,
          shares: 0,
        };
        if (!current.topVideo || (video.views ?? 0) > (current.topVideo.views ?? 0)) {
          current.topVideo = video;
        }
        current.views += video.views ?? 0;
        current.likes += video.likes ?? 0;
        current.comments += video.comments ?? 0;
        current.shares += video.shares ?? 0;
        if ((video.creator_followers ?? 0) > current.followers) current.followers = video.creator_followers ?? 0;
        bigCreatorsMap.set(creator, current);
      });
    const bigCreators = Array.from(bigCreatorsMap.values()).sort((a, b) =>
      bigCreatorSort === "followers_asc" ? a.followers - b.followers : b.followers - a.followers,
    );
    bigCreatorsRows.innerHTML = bigCreators.length
      ? bigCreators
          .map(
            (item) =>
              `<tr><td>${item.topVideo ? formatPosted(item.topVideo.posted_at) : "-"}</td><td>${makeCreatorLink(item.creator)}</td><td class="video-cell">${
                item.topVideo ? makeThumb(item.topVideo) : "-"
              }</td><td>${formatCompact(item.followers)}</td><td>${formatCompact(
                item.views,
              )}</td><td>${formatCompact(item.likes)}</td><td>${formatCompact(item.comments)}</td><td>${formatCompact(
                item.shares,
              )}</td></tr>`,
          )
          .join("")
      : `<tr><td colspan="8" class="muted">No big creators yet.</td></tr>`;

    setupPager("viral-rows");
    setupPager("rising-rows");
    setupPager("new-rows");
    setupPager("big-creators-rows");
  };

  const renderOverviewTop = ( 
    videos: VideoRow[], 
    stats: SoundStatsRow[], 
    milestones: MilestoneRow[],
  ): number => { 
    const allTimeByStats = Math.max(0, ...stats.map((row) => row.total_posts ?? 0)); 
    const allTimePosts = allTimeByStats || videos.length; 
    const allTimeEl = document.getElementById("kpi-all-time"); 
    if (allTimeEl) allTimeEl.textContent = formatNumber(allTimePosts); 
    const creatorSet = new Set(videos.map((video) => (video.creator_username ?? "").trim()).filter(Boolean));
    const creatorEl = document.getElementById("kpi-creators");
    if (creatorEl) creatorEl.textContent = formatNumber(creatorSet.size);
    renderMilestones(allTimePosts, milestones); 
    maybeShowCongrats(allTimePosts, milestones); 
    return allTimePosts;
  }; 

  const renderLoadError = (message: string) => {
    const allTimeEl = document.getElementById("kpi-all-time"); 
    if (allTimeEl) allTimeEl.textContent = "Error"; 
    const analytics = document.getElementById("daily-analytics-rows"); 
    if (analytics) analytics.innerHTML = `<tr><td colspan="3" class="down">${escapeHtml(message)}</td></tr>`; 
  }; 

  const loadDashboardData = async () => {
    if (!supabase) {
      renderLoadError(supabaseConfigError ?? "Supabase is not configured");
      return;
    }

    try {
      const [videos, stats, statsHistory, snapshotsResult, milestones, appSettings] = await Promise.all([ 
        supabase 
          .from("tt_videos_current") 
          .select("video_id,video_url,title,thumbnail_url,creator_username,creator_followers,creator_size,posted_at,views,likes,comments,shares,favorites,engagement_total,engagement_rate") 
          .order("views", { ascending: false }) 
          .limit(1000), 
        supabase
          .from("tt_sound_stats_current")
          .select("sound_id,total_posts,total_posts_global,captured_at")
          .order("captured_at", { ascending: false })
          .limit(100),
        supabase
          .from("tt_sound_stats_history")
          .select("sound_id,total_posts_global,captured_at")
          .order("captured_at", { ascending: true })
          .limit(10000),
        supabase 
          .from("tt_video_snapshots") 
          .select("sound_id,captured_at") 
          .order("captured_at", { ascending: true }) 
          .limit(10000), 
        supabase
          .from("tt_milestones")
          .select("id,title,target_posts,sort_order,is_active")
          .eq("is_active", true)
          .order("sort_order", { ascending: true }),
        supabase
          .from("tt_app_settings")
          .select("app_name,app_subtitle,logo_text,logo_url,footer_title,footer_subtitle,copyright_text,social_youtube,social_tiktok,social_facebook,social_instagram")
          .eq("id", 1)
          .maybeSingle(),
      ]); 
      if (videos.error) throw new Error(videos.error.message); 
      if (stats.error) throw new Error(stats.error.message); 
      if (statsHistory.error) throw new Error(statsHistory.error.message); 
      if (snapshotsResult.error) throw new Error(snapshotsResult.error.message); 
      if (milestones.error) throw new Error(milestones.error.message); 
      if (appSettings.error) throw new Error(appSettings.error.message); 
      const snapshots = snapshotsResult.data ?? []; 
      const branding = appSettings.data
        ? toAppSettings({
            appName: appSettings.data.app_name,
            appSubtitle: appSettings.data.app_subtitle,
            logoText: appSettings.data.logo_text,
            logoUrl: appSettings.data.logo_url,
            footerTitle: appSettings.data.footer_title,
            footerSubtitle: appSettings.data.footer_subtitle,
            copyrightText: appSettings.data.copyright_text,
            socialYoutube: appSettings.data.social_youtube,
            socialTiktok: appSettings.data.social_tiktok,
            socialFacebook: appSettings.data.social_facebook,
            socialInstagram: appSettings.data.social_instagram,
          })
        : DEFAULT_APP_SETTINGS;
      applyAppSettingsToLayout(branding);
      latestVideosRows = (videos.data ?? []) as VideoRow[];
      renderVideos(latestVideosRows);
      latestAllTimePosts = renderOverviewTop( 
        (videos.data ?? []) as VideoRow[], 
        (stats.data ?? []) as SoundStatsRow[], 
        (milestones.data ?? []) as MilestoneRow[],
      ); 
      latestHistoryRows = (statsHistory.data ?? []) as SoundStatsHistoryRow[];
      latestSnapshotRows = snapshots as SnapshotRow[];
      latestCurrentStatsRows = (stats.data ?? []) as SoundStatsRow[];
      refreshOverviewDaily();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to load data";
      renderLoadError(message);
    }
  };

  void loadDashboardData();
  window.setInterval(() => {
    void loadDashboardData();
  }, 30_000);
};
