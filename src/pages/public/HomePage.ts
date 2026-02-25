import { renderFooter } from "../../components/layout/Footer";
import { renderNavbar } from "../../components/layout/Navbar";
import { supabase, supabaseConfigError } from "../../lib/supabase";

type MainTab = "overview" | "videos" | "milestones";
type VideoTab = "viral" | "rising" | "new";

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
};

type SoundStatsHistoryRow = {
  sound_id: string;
  total_posts_global: number;
  captured_at: string;
};

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
  return date.toLocaleString();
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

const setupPager = (tbodyId: string) => {
  const tbody = document.getElementById(tbodyId) as HTMLTableSectionElement | null;
  const pager = document.querySelector<HTMLElement>(`.pager[data-target="${tbodyId}"]`);
  if (!tbody || !pager) return;

  const rows = Array.from(tbody.querySelectorAll("tr"));
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
        <section class="tab-panel active" id="panel-overview">
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
            <div class="row-head"><h3>Daily Analytics Table</h3><span class="pill">Tracked Daily</span></div>
            <table><thead><tr><th>Date</th><th>Posts</th><th>Change</th><th>Cumulative</th></tr></thead><tbody id="daily-analytics-rows"></tbody></table>
            <div class="pager" data-target="daily-analytics-rows"><button type="button" class="pager-btn prev">Prev</button><span class="pager-info">Page 1</span><button type="button" class="pager-btn next">Next</button></div>
          </article>
        </section>

        <section class="tab-panel" id="panel-videos">
          <div class="subtabs">
            <button class="subtab active" data-video-tab="viral">Viral</button>
            <button class="subtab" data-video-tab="rising">Rising</button>
            <button class="subtab" data-video-tab="new">New Videos</button>
          </div>
          <section class="video-panel active" id="video-viral">
            <article class="glass-card table-wrap">
              <div class="row-head"><h3>Most Viral Videos</h3><span class="pill">Impact Rank</span></div>
              <table><thead><tr><th>Rank</th><th>Video</th><th>Creator</th><th>Followers</th><th>Views</th><th>Likes</th><th>Comments</th><th>Shares</th></tr></thead><tbody id="viral-rows"></tbody></table>
              <div class="pager" data-target="viral-rows"><button type="button" class="pager-btn prev">Prev</button><span class="pager-info">Page 1</span><button type="button" class="pager-btn next">Next</button></div>
            </article>
          </section>
          <section class="video-panel" id="video-rising">
            <article class="glass-card table-wrap">
              <div class="row-head"><h3>Rising Videos</h3><span class="pill">Growth Velocity</span></div>
              <table><thead><tr><th>Rank</th><th>Video</th><th>Creator</th><th>Followers</th><th>ER</th><th>24h Growth</th><th>Status</th></tr></thead><tbody id="rising-rows"></tbody></table>
              <div class="pager" data-target="rising-rows"><button type="button" class="pager-btn prev">Prev</button><span class="pager-info">Page 1</span><button type="button" class="pager-btn next">Next</button></div>
            </article>
          </section>
          <section class="video-panel" id="video-new">
            <article class="glass-card table-wrap">
              <div class="row-head"><h3>New Videos Using Visa Sounds</h3><span class="pill">Newest First</span></div>
              <table><thead><tr><th>Posted</th><th>Video</th><th>Creator</th><th>Views</th><th>Likes</th><th>Comments</th><th>Shares</th></tr></thead><tbody id="new-rows"></tbody></table>
              <div class="pager" data-target="new-rows"><button type="button" class="pager-btn prev">Prev</button><span class="pager-info">Page 1</span><button type="button" class="pager-btn next">Next</button></div>
            </article>
          </section>
          <article class="glass-card table-wrap">
            <div class="row-head"><h3>Big Creators (50K+ Followers)</h3><span class="pill">Creator Spotlight</span></div>
            <table><thead><tr><th>Creator</th><th>Followers</th><th>Posts Using Visa Sound</th><th>Total Engagement</th><th>Top Video</th></tr></thead><tbody id="big-creators-rows"></tbody></table>
            <div class="pager" data-target="big-creators-rows"><button type="button" class="pager-btn prev">Prev</button><span class="pager-info">Page 1</span><button type="button" class="pager-btn next">Next</button></div>
          </article>
        </section>

        <section class="tab-panel" id="panel-milestones">
          <article class="glass-card"><div class="row-head"><h3>Overall Posts Milestones</h3><span class="pill">All-Time Posts</span></div><p class="muted">Progress tracker for total number of TikTok posts using Visa sounds.</p></article>
          <section class="milestone-grid" id="milestone-cards"></section>
          <article class="glass-card table-wrap"><table><thead><tr><th>Milestone</th><th>Target Posts</th><th>Current Total</th><th>Progress</th><th>Remaining</th></tr></thead><tbody id="milestone-rows"></tbody></table><div class="pager" data-target="milestone-rows"><button type="button" class="pager-btn prev">Prev</button><span class="pager-info">Page 1</span><button type="button" class="pager-btn next">Next</button></div></article>
        </section>
      </main>
      ${renderFooter()}
    </div>
  `;

  const navLinks = document.querySelectorAll<HTMLButtonElement>(".nav-link");
  const mainPanels: Record<MainTab, Element | null> = {
    overview: document.querySelector("#panel-overview"),
    videos: document.querySelector("#panel-videos"),
    milestones: document.querySelector("#panel-milestones"),
  };
  navLinks.forEach((button) => {
    button.addEventListener("click", () => {
      const selected = button.dataset.tab as MainTab;
      navLinks.forEach((item) => item.classList.toggle("active", item === button));
      Object.entries(mainPanels).forEach(([key, panel]) => panel?.classList.toggle("active", key === selected));
    });
  });

  const videoTabs = document.querySelectorAll<HTMLButtonElement>(".subtab");
  const videoPanels: Record<VideoTab, Element | null> = {
    viral: document.querySelector("#video-viral"),
    rising: document.querySelector("#video-rising"),
    new: document.querySelector("#video-new"),
  };
  videoTabs.forEach((button) => {
    button.addEventListener("click", () => {
      const selected = button.dataset.videoTab as VideoTab;
      videoTabs.forEach((item) => item.classList.toggle("active", item === button));
      Object.entries(videoPanels).forEach(([key, panel]) => panel?.classList.toggle("active", key === selected));
    });
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

  const renderOverviewDaily = (historyRows: SoundStatsHistoryRow[]) => {
    const byDaySound = new Map<string, Map<string, number>>();
    historyRows.forEach((row) => {
      const time = new Date(row.captured_at).getTime();
      if (Number.isNaN(time)) return;
      const day = new Date(time).toISOString().slice(0, 10);
      const soundId = (row.sound_id ?? "").trim();
      if (!soundId) return;
      const soundMap = byDaySound.get(day) ?? new Map<string, number>();
      const prev = soundMap.get(soundId) ?? 0;
      const next = Number(row.total_posts_global ?? 0);
      soundMap.set(soundId, Math.max(prev, next));
      byDaySound.set(day, soundMap);
    });

    const dayTotals = Array.from(byDaySound.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([day, soundMap]) => ({
        day,
        total: Array.from(soundMap.values()).reduce((sum, value) => sum + value, 0),
      }));

    const rows = dayTotals.map((item, index) => {
      const prevTotal = index === 0 ? item.total : dayTotals[index - 1].total;
      const added = index === 0 ? item.total : item.total - prevTotal;
      return [item.day, added, item.total] as const;
    }).slice(-14);
    const bars = document.getElementById("daily-bars");
    if (bars) {
      if (!rows.length) bars.innerHTML = `<span style="height:10%"></span>`;
      else {
        const max = Math.max(...rows.map((item) => Math.max(0, item[1])));
        bars.innerHTML = rows
          .map(([_, count]) => {
            const display = Math.max(0, count);
            return `<span style="height:${Math.max(8, (display / Math.max(1, max)) * 100).toFixed(1)}%"></span>`;
          })
          .join("");
      }
    }
    const table = document.getElementById("daily-analytics-rows");
    if (table) {
      let running = 0;
      const html = rows
        .map(([day, count, total], index) => {
          const prev = index === 0 ? count : rows[index - 1][1];
          const delta = count - prev;
          running = total;
          const cls = delta >= 0 ? "up" : "down";
          return `<tr><td>${new Date(day).toLocaleDateString()}</td><td>${formatNumber(count)}</td><td class="${cls}">${
            delta >= 0 ? "+" : ""
          }${formatNumber(delta)}</td><td>${formatNumber(running)}</td></tr>`;
        })
        .join("");
      table.innerHTML = html || `<tr><td colspan="4" class="muted">No posted date data yet.</td></tr>`;
      setupPager("daily-analytics-rows");
    }

    const today = new Date().toISOString().slice(0, 10);
    const yesterdayDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const todayRow = rows.find((row) => row[0] === today);
    const yesterdayRow = rows.find((row) => row[0] === yesterdayDate);
    const postsToday = todayRow?.[1] ?? 0;
    const postsYesterday = yesterdayRow?.[1] ?? 0;
    const delta = postsToday - postsYesterday;
    const last7 = rows.slice(-7);
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
    const rising = [...withDefaults].sort((a, b) => (b.engagement_rate ?? 0) - (a.engagement_rate ?? 0));
    const newest = [...withDefaults].sort((a, b) => {
      const av = a.posted_at ? new Date(a.posted_at).getTime() : 0;
      const bv = b.posted_at ? new Date(b.posted_at).getTime() : 0;
      return bv - av;
    });
    viralRows.innerHTML = viral
      .map((video, index) => `<tr><td>#${index + 1}</td><td class="video-cell">${makeThumb(video)}</td><td>${escapeHtml(
        video.creator_username ?? "@unknown",
      )}</td><td>${formatCompact(video.creator_followers ?? 0)}</td><td>${formatCompact(
        video.views ?? 0,
      )}</td><td>${formatCompact(video.likes ?? 0)}</td><td>${formatCompact(video.comments ?? 0)}</td><td>${formatCompact(
        video.shares ?? 0,
      )}</td></tr>`)
      .join("");
    risingRows.innerHTML = rising
      .map((video, index) => `<tr><td>#${index + 1}</td><td class="video-cell">${makeThumb(video)}</td><td>${escapeHtml(
        video.creator_username ?? "@unknown",
      )}</td><td>${formatCompact(video.creator_followers ?? 0)}</td><td>${(
        (video.engagement_rate ?? 0) * 100
      ).toFixed(1)}%</td><td class="up">+${Math.round((video.engagement_rate ?? 0) * 1000)}%</td><td class="up">${
        (video.creator_size ?? "small") === "big" ? "Big creator" : "Rising fast"
      }</td></tr>`)
      .join("");
    newRows.innerHTML = newest
      .map((video) => `<tr><td>${formatPosted(video.posted_at)}</td><td class="video-cell">${makeThumb(video)}</td><td>${escapeHtml(
        video.creator_username ?? "@unknown",
      )}</td><td>${formatCompact(video.views ?? 0)}</td><td>${formatCompact(
        video.likes ?? 0,
      )}</td><td>${formatCompact(video.comments ?? 0)}</td><td>${formatCompact(video.shares ?? 0)}</td></tr>`)
      .join("");

    const bigCreatorsMap = new Map<string, { creator: string; followers: number; posts: number; engagement: number; topVideo: VideoRow | null }>();
    withDefaults
      .filter((video) => (video.creator_followers ?? 0) >= 50_000)
      .forEach((video) => {
        const creator = video.creator_username ?? "@unknown";
        const current = bigCreatorsMap.get(creator) ?? {
          creator,
          followers: video.creator_followers ?? 0,
          posts: 0,
          engagement: 0,
          topVideo: null,
        };
        current.posts += 1;
        current.engagement += video.engagement_total ?? 0;
        if (!current.topVideo || (video.views ?? 0) > (current.topVideo.views ?? 0)) current.topVideo = video;
        if ((video.creator_followers ?? 0) > current.followers) current.followers = video.creator_followers ?? 0;
        bigCreatorsMap.set(creator, current);
      });
    const bigCreators = Array.from(bigCreatorsMap.values()).sort((a, b) => b.followers - a.followers);
    bigCreatorsRows.innerHTML = bigCreators.length
      ? bigCreators
          .map((item) => `<tr><td>${escapeHtml(item.creator)}</td><td>${formatCompact(item.followers)}</td><td>${formatNumber(
              item.posts,
            )}</td><td>${formatCompact(item.engagement)}</td><td class="video-cell">${
              item.topVideo ? makeThumb(item.topVideo) : "-"
            }</td></tr>`)
          .join("")
      : `<tr><td colspan="5" class="muted">No big creators yet.</td></tr>`;

    setupPager("viral-rows");
    setupPager("rising-rows");
    setupPager("new-rows");
    setupPager("big-creators-rows");
  };

  const renderOverviewTop = (
    videos: VideoRow[],
    stats: SoundStatsRow[],
    milestones: MilestoneRow[],
  ) => {
    const allTimeByStats = Math.max(0, ...stats.map((row) => row.total_posts ?? 0));
    const allTimePosts = allTimeByStats || videos.length;
    const allTimeEl = document.getElementById("kpi-all-time");
    if (allTimeEl) allTimeEl.textContent = formatNumber(allTimePosts);
    const creatorSet = new Set(videos.map((video) => (video.creator_username ?? "").trim()).filter(Boolean));
    const creatorEl = document.getElementById("kpi-creators");
    if (creatorEl) creatorEl.textContent = formatNumber(creatorSet.size);
    renderMilestones(allTimePosts, milestones);
    maybeShowCongrats(allTimePosts, milestones);
  };

  const renderLoadError = (message: string) => {
    const allTimeEl = document.getElementById("kpi-all-time");
    if (allTimeEl) allTimeEl.textContent = "Error";
    const analytics = document.getElementById("daily-analytics-rows");
    if (analytics) analytics.innerHTML = `<tr><td colspan="4" class="down">${escapeHtml(message)}</td></tr>`;
  };

  const loadDashboardData = async () => {
    if (!supabase) {
      renderLoadError(supabaseConfigError ?? "Supabase is not configured");
      return;
    }

    try {
      const [videos, stats, milestones, statsHistory] = await Promise.all([
        supabase
          .from("tt_videos_current")
          .select("video_id,video_url,title,thumbnail_url,creator_username,creator_followers,creator_size,posted_at,views,likes,comments,shares,favorites,engagement_total,engagement_rate")
          .order("views", { ascending: false })
          .limit(1000),
        supabase
          .from("tt_sound_stats_current")
          .select("sound_id,total_posts")
          .order("captured_at", { ascending: false })
          .limit(100),
        supabase
          .from("tt_milestones")
          .select("id,title,target_posts,sort_order,is_active")
          .eq("is_active", true)
          .order("sort_order", { ascending: true })
          .order("created_at", { ascending: true }),
        supabase
          .from("tt_sound_stats_history")
          .select("sound_id,total_posts_global,captured_at")
          .order("captured_at", { ascending: true })
          .limit(10000),
      ]);
      if (videos.error) throw new Error(videos.error.message);
      if (stats.error) throw new Error(stats.error.message);
      if (milestones.error) throw new Error(milestones.error.message);
      if (statsHistory.error) throw new Error(statsHistory.error.message);
      renderVideos((videos.data ?? []) as VideoRow[]);
      renderOverviewTop(
        (videos.data ?? []) as VideoRow[],
        (stats.data ?? []) as SoundStatsRow[],
        (milestones.data ?? []) as MilestoneRow[],
      );
      renderOverviewDaily((statsHistory.data ?? []) as SoundStatsHistoryRow[]);
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
