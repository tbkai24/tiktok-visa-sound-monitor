import { renderFooter } from "../../components/layout/Footer";
import { supabase, supabaseConfigError } from "../../lib/supabase";

type SoundStatsRow = {
  sound_id: string;
  total_posts: number;
  batch_posts?: number;
  total_posts_global?: number;
  big_creators_count: number;
  small_high_engagement_count: number;
  captured_at: string;
};

type MilestoneTargetRow = {
  id: string;
  title: string;
  target_posts: number;
  sort_order: number;
  is_active: boolean;
};

const formatNumber = (value: number) => value.toLocaleString();
const escapeHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
const PAGE_SIZE = 10;

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

const setActivePanel = (selected: "milestones" | "settings") => {
  const links = document.querySelectorAll<HTMLButtonElement>(".admin-link");
  const panels = document.querySelectorAll<HTMLElement>(".admin-panel");
  links.forEach((link) => link.classList.toggle("active", link.dataset.adminTab === selected));
  panels.forEach((panel) =>
    panel.classList.toggle("active", panel.dataset.adminPanel === selected),
  );
};

export const renderAdminPage = (root: HTMLDivElement) => {
  root.innerHTML = `
    <div class="app-shell">
      <header class="navbar">
        <div class="navbar-inner">
          <div class="brand-wrap">
            <span class="brand-dot">A</span>
            <div>
              <p class="brand-title">ADMIN PANEL</p>
              <p class="brand-subtitle">TikTok Visa Sound Monitor</p>
            </div>
          </div>
          <nav class="nav-links">
            <a class="admin-entry-link" href="/">Public Dashboard</a>
            <button id="admin-logout-top" class="nav-link">Log out</button>
          </nav>
        </div>
      </header>

      <main class="main-wrap">
        <div class="admin-layout">
          <aside class="admin-sidebar">
            <button class="admin-link active" data-admin-tab="milestones">Milestones</button>
            <button class="admin-link" data-admin-tab="settings">Settings</button>
          </aside>

          <section class="admin-content">
            <section class="admin-panel active" data-admin-panel="milestones">
              <article class="glass-card">
                <div class="row-head">
                  <h3>Milestones Monitor</h3>
                  <span class="pill">All Sounds</span>
                </div>
                <p class="muted">Overall posts per tracked sound ID.</p>
              </article>

              <article class="glass-card table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Sound ID</th>
                      <th>Total Posts (Global)</th>
                      <th>Posts in Last Batch</th>
                      <th>Big Creators</th>
                      <th>Small + High ER</th>
                      <th>Captured At</th>
                    </tr>
                  </thead>
                  <tbody id="admin-milestone-rows"></tbody>
                </table>
                <div class="pager" data-target="admin-milestone-rows"><button type="button" class="pager-btn prev">Prev</button><span class="pager-info">Page 1</span><button type="button" class="pager-btn next">Next</button></div>
              </article>

              <article class="glass-card">
                <div class="row-head">
                  <h3>Milestone Targets</h3>
                  <span class="pill">Admin Managed</span>
                </div>
                <div id="admin-alert" class="admin-alert" style="display:none"></div>
                <div class="inline-form">
                  <input id="milestone-title-input" type="text" placeholder="Title (e.g. 5,000 Posts)" />
                  <input id="milestone-target-input" type="number" min="1" placeholder="Target posts" />
                  <button type="button" id="milestone-add-btn" class="small-btn">Add Milestone</button>
                </div>
              </article>

              <article class="glass-card table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Order</th>
                      <th>Title</th>
                      <th>Target Posts</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody id="admin-target-rows"></tbody>
                </table>
                <div class="pager" data-target="admin-target-rows"><button type="button" class="pager-btn prev">Prev</button><span class="pager-info">Page 1</span><button type="button" class="pager-btn next">Next</button></div>
              </article>
            </section>

            <section class="admin-panel" data-admin-panel="settings">
              <article class="glass-card">
                <div class="row-head">
                  <h3>Settings</h3>
                  <span class="pill">Runtime</span>
                </div>
                <div class="settings-grid">
                  <label>
                    <span>Auto refresh (seconds)</span>
                    <input id="admin-refresh-seconds" type="number" min="10" max="300" value="30" />
                  </label>
                  <label>
                    <span>Tracked Sound IDs (read-only)</span>
                    <input id="admin-sound-ids" type="text" readonly />
                  </label>
                </div>
                <p class="muted">Sound IDs are managed from env and function secrets.</p>
              </article>
            </section>
          </section>
        </div>
      </main>
      ${renderFooter()}
    </div>
  `;

  const sidebarLinks = document.querySelectorAll<HTMLButtonElement>(".admin-link");
  sidebarLinks.forEach((link) => {
    link.addEventListener("click", () => {
      const selected = (link.dataset.adminTab ?? "milestones") as "milestones" | "settings";
      setActivePanel(selected);
    });
  });

  const logoutTop = document.getElementById("admin-logout-top");
  logoutTop?.addEventListener("click", async () => {
    if (supabase) {
      await supabase.auth.signOut();
    }
    window.location.replace("/admin/login");
  });

  const soundIdsInput = document.getElementById("admin-sound-ids") as HTMLInputElement | null;
  const env = (import.meta as unknown as { env: Record<string, string | undefined> }).env;
  if (soundIdsInput) {
    soundIdsInput.value =
      env.TTVM_TIKTOK_SOUND_IDS ??
      env.TIKTOK_SOUND_IDS ??
      "Set TTVM_TIKTOK_SOUND_IDS in .env";
  }

  const rowsEl = document.getElementById("admin-milestone-rows");
  const targetsEl = document.getElementById("admin-target-rows");
  const addBtn = document.getElementById("milestone-add-btn") as HTMLButtonElement | null;
  const titleInput = document.getElementById("milestone-title-input") as HTMLInputElement | null;
  const targetInput = document.getElementById("milestone-target-input") as HTMLInputElement | null;
  const alertEl = document.getElementById("admin-alert") as HTMLDivElement | null;
  let allTimePosts = 0;
  let editingId: string | null = null;
  let editTitle = "";
  let editTarget = "";
  if (!rowsEl || !targetsEl || !addBtn || !titleInput || !targetInput) return;

  const setAlert = (type: "success" | "error", message: string) => {
    if (!alertEl) return;
    alertEl.style.display = "block";
    alertEl.className = `admin-alert ${type}`;
    alertEl.textContent = message;
  };

  if (!supabase) {
    rowsEl.innerHTML = `<tr><td colspan="6" class="down">${escapeHtml(
      supabaseConfigError ?? "Supabase is not configured.",
    )}</td></tr>`;
    targetsEl.innerHTML = `<tr><td colspan="5" class="down">${escapeHtml(
      supabaseConfigError ?? "Supabase is not configured.",
    )}</td></tr>`;
    return;
  }
  const client = supabase;

  const renderTargets = (targetRows: MilestoneTargetRow[]) => {
    if (!targetRows.length) {
      targetsEl.innerHTML = `<tr><td colspan="5" class="muted">No milestone targets yet.</td></tr>`;
      return;
    }

    targetsEl.innerHTML = targetRows
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((row, index) => {
        const achieved = allTimePosts >= (row.target_posts ?? 0);
        const isEditing = editingId === row.id;
        return `
          <tr>
            <td>${index + 1}</td>
            <td>${
              isEditing
                ? `<input class="inline-edit-input" data-edit-field="title" value="${escapeHtml(
                    editTitle,
                  )}" />`
                : escapeHtml(row.title)
            }</td>
            <td>${
              isEditing
                ? `<input class="inline-edit-input" data-edit-field="target" type="number" min="1" value="${Number(
                    editTarget || row.target_posts || 0,
                  )}" />`
                : formatNumber(row.target_posts ?? 0)
            }</td>
            <td>${row.is_active ? '<span class="up">ACTIVE</span>' : '<span class="muted">INACTIVE</span>'} • ${
              achieved ? '<span class="up">ACHIEVED</span>' : '<span class="muted">IN PROGRESS</span>'
            }</td>
            <td>
              <div class="icon-actions">
                ${
                  isEditing
                    ? `<button type="button" class="small-btn target-save-btn" data-id="${escapeHtml(
                        row.id,
                      )}">Save</button>
                       <button type="button" class="small-btn target-cancel-btn">Cancel</button>`
                    : `<button type="button" class="small-btn target-edit-btn" data-id="${escapeHtml(
                        row.id,
                      )}" data-title="${escapeHtml(row.title)}" data-target="${row.target_posts ?? 0}">Edit</button>
                       <button type="button" class="small-btn target-toggle-btn" data-id="${escapeHtml(
                         row.id,
                       )}" data-active="${row.is_active ? "1" : "0"}">${row.is_active ? "Disable" : "Enable"}</button>
                       <button type="button" class="small-btn target-delete-btn" data-id="${escapeHtml(
                         row.id,
                       )}">Delete</button>`
                }
              </div>
            </td>
          </tr>
        `;
      })
      .join("");
  };

  const loadTargets = async () => {
    const { data, error } = await client
      .from("tt_milestones")
      .select("id,title,target_posts,sort_order,is_active")
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });
    if (error) {
      targetsEl.innerHTML = `<tr><td colspan="5" class="down">${escapeHtml(error.message)}</td></tr>`;
      setAlert("error", `Milestones load failed: ${error.message}`);
      return [];
    }
    const rows = (data ?? []) as MilestoneTargetRow[];
    renderTargets(rows);
    setupPager("admin-target-rows");
    return rows;
  };

  const loadStats = async () => {
    const { data: rows, error } = await client
      .from("tt_sound_stats_current")
      .select("sound_id,total_posts,batch_posts,total_posts_global,big_creators_count,small_high_engagement_count,captured_at")
      .order("total_posts", { ascending: false });

    if (error) {
      rowsEl.innerHTML = `<tr><td colspan="6" class="down">${escapeHtml(error.message)}</td></tr>`;
      setAlert("error", `Stats load failed: ${error.message}`);
      return;
    }

    const dataRows = (rows ?? []) as SoundStatsRow[];
    if (!dataRows.length) {
      rowsEl.innerHTML = `<tr><td colspan="6" class="muted">No milestones data yet.</td></tr>`;
      allTimePosts = 0;
      return;
    }

    allTimePosts = Math.max(0, ...dataRows.map((row) => row.total_posts_global ?? row.total_posts ?? 0));

    rowsEl.innerHTML = dataRows
      .map((row) => {
        const captured = row.captured_at
          ? new Date(row.captured_at).toLocaleString()
          : "-";
        return `
          <tr>
            <td>${escapeHtml(row.sound_id)}</td>
            <td>${formatNumber(row.total_posts_global ?? row.total_posts ?? 0)}</td>
            <td>${formatNumber(row.batch_posts ?? 0)}</td>
            <td>${formatNumber(row.big_creators_count ?? 0)}</td>
            <td>${formatNumber(row.small_high_engagement_count ?? 0)}</td>
            <td>${escapeHtml(captured)}</td>
          </tr>
        `;
      })
      .join("");
    setupPager("admin-milestone-rows");
  };

  void client.auth.getSession().then(async ({ data }) => {
    if (!data.session) {
      window.location.replace("/admin/login");
      return;
    }
    await loadStats();
    await loadTargets();
  });

  addBtn.addEventListener("click", async () => {
    const title = titleInput.value.trim();
    const target = Number(targetInput.value);
    if (!title || !Number.isFinite(target) || target <= 0) {
      setAlert("error", "Enter a valid title and target posts (> 0).");
      return;
    }

    const { data: existingRows, error: existingRowsError } = await client
      .from("tt_milestones")
      .select("sort_order")
      .order("sort_order", { ascending: false })
      .limit(1);
    if (existingRowsError) {
      setAlert("error", `Cannot prepare milestone order: ${existingRowsError.message}`);
      return;
    }
    const nextOrder = (existingRows?.[0]?.sort_order ?? -1) + 1;

    const { error } = await client.from("tt_milestones").insert({
      title,
      target_posts: target,
      sort_order: nextOrder,
      is_active: true,
    });
    if (error) {
      setAlert("error", `Add milestone failed: ${error.message}`);
      return;
    }

    titleInput.value = "";
    targetInput.value = "";
    await loadTargets();
    setAlert("success", "Milestone added.");
  });

  targetsEl.addEventListener("click", async (event) => {
    const target = event.target as HTMLElement;
    const editBtn = target.closest(".target-edit-btn") as HTMLButtonElement | null;
    const saveBtn = target.closest(".target-save-btn") as HTMLButtonElement | null;
    const cancelBtn = target.closest(".target-cancel-btn") as HTMLButtonElement | null;
    const toggleBtn = target.closest(".target-toggle-btn") as HTMLButtonElement | null;
    const deleteBtn = target.closest(".target-delete-btn") as HTMLButtonElement | null;

    if (editBtn) {
      editingId = editBtn.dataset.id ?? null;
      editTitle = editBtn.dataset.title ?? "";
      editTarget = editBtn.dataset.target ?? "";
      await loadTargets();
      return;
    }

    if (cancelBtn) {
      editingId = null;
      editTitle = "";
      editTarget = "";
      await loadTargets();
      setAlert("success", "Edit canceled.");
      return;
    }

    if (saveBtn) {
      const id = saveBtn.dataset.id ?? "";
      if (!id) return;
      const row = saveBtn.closest("tr");
      const titleField = row?.querySelector<HTMLInputElement>('input[data-edit-field="title"]');
      const targetField = row?.querySelector<HTMLInputElement>('input[data-edit-field="target"]');
      const nextTitle = titleField?.value.trim() ?? "";
      const nextTarget = Number(targetField?.value ?? "");
      if (!nextTitle || !Number.isFinite(nextTarget) || nextTarget <= 0) {
        setAlert("error", "Enter a valid title and target posts (> 0).");
        return;
      }
      const { error } = await client
        .from("tt_milestones")
        .update({ title: nextTitle, target_posts: nextTarget, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) {
        setAlert("error", `Update milestone failed: ${error.message}`);
        return;
      }
      editingId = null;
      editTitle = "";
      editTarget = "";
      await loadTargets();
      setAlert("success", "Milestone updated.");
      return;
    }

    if (toggleBtn) {
      const id = toggleBtn.dataset.id ?? "";
      const isActive = toggleBtn.dataset.active === "1";
      if (!id) return;
      const { error } = await client
        .from("tt_milestones")
        .update({ is_active: !isActive, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) {
        setAlert("error", `Toggle milestone failed: ${error.message}`);
        return;
      }
      await loadTargets();
      setAlert("success", `Milestone ${isActive ? "disabled" : "enabled"}.`);
      return;
    }

    if (deleteBtn) {
      const id = deleteBtn.dataset.id ?? "";
      if (!id) return;
      const { error } = await client.from("tt_milestones").delete().eq("id", id);
      if (error) {
        setAlert("error", `Delete milestone failed: ${error.message}`);
        return;
      }
      await loadTargets();
      setAlert("success", "Milestone deleted.");
    }
  });
};
