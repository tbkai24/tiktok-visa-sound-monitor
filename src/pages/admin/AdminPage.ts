import { renderFooter } from "../../components/layout/Footer";
import { 
  applyAppSettingsToLayout,
  DEFAULT_APP_SETTINGS, 
  toAppSettings, 
  type AppSettings, 
} from "../../lib/appSettings"; 
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
                <div id="admin-settings-alert" class="admin-alert" style="display:none"></div>
                <div class="settings-grid">
                  <label>
                    <span>App Name</span>
                    <input id="admin-app-name" type="text" />
                  </label>
                  <label>
                    <span>Tagline / Subtitle</span>
                    <input id="admin-app-subtitle" type="text" />
                  </label>
                  <label>
                    <span>Logo Text (1-2 chars)</span>
                    <input id="admin-logo-text" type="text" maxlength="2" />
                  </label>
                  <label>
                    <span>Logo URL (image)</span>
                    <input id="admin-logo-url" type="url" placeholder="https://..." />
                  </label>
                  <label>
                    <span>Footer Title</span>
                    <input id="admin-footer-title" type="text" />
                  </label>
                  <label>
                    <span>Footer Subtitle</span>
                    <input id="admin-footer-subtitle" type="text" />
                  </label>
                  <label>
                    <span>Copyright Text</span>
                    <input id="admin-copyright-text" type="text" />
                  </label>
                  <label>
                    <span>YouTube URL</span>
                    <input id="admin-social-youtube" type="url" placeholder="https://youtube.com/..." />
                  </label>
                  <label>
                    <span>TikTok URL</span>
                    <input id="admin-social-tiktok" type="url" placeholder="https://tiktok.com/@..." />
                  </label>
                  <label>
                    <span>Facebook URL</span>
                    <input id="admin-social-facebook" type="url" placeholder="https://facebook.com/..." />
                  </label>
                  <label>
                    <span>Instagram URL</span>
                    <input id="admin-social-instagram" type="url" placeholder="https://instagram.com/..." />
                  </label>
                  <label>
                    <span>Tracked Sound IDs (read-only)</span>
                    <input id="admin-sound-ids" type="text" readonly />
                  </label>
                </div>
                <div class="icon-actions" style="margin-top:10px;">
                  <button type="button" id="admin-settings-save" class="small-btn">Save Settings</button>
                  <button type="button" id="admin-settings-reset" class="small-btn">Reset Defaults</button>
                </div>
                <p class="muted">Name/logo/footer settings are applied immediately after save + refresh.</p>
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
  const settingsAlertEl = document.getElementById("admin-settings-alert") as HTMLDivElement | null;
  const appNameInput = document.getElementById("admin-app-name") as HTMLInputElement | null;
  const appSubtitleInput = document.getElementById("admin-app-subtitle") as HTMLInputElement | null; 
  const logoTextInput = document.getElementById("admin-logo-text") as HTMLInputElement | null; 
  const logoUrlInput = document.getElementById("admin-logo-url") as HTMLInputElement | null;
  const footerTitleInput = document.getElementById("admin-footer-title") as HTMLInputElement | null; 
  const footerSubtitleInput = document.getElementById("admin-footer-subtitle") as HTMLInputElement | null; 
  const copyrightTextInput = document.getElementById("admin-copyright-text") as HTMLInputElement | null;
  const socialYoutubeInput = document.getElementById("admin-social-youtube") as HTMLInputElement | null;
  const socialTiktokInput = document.getElementById("admin-social-tiktok") as HTMLInputElement | null;
  const socialFacebookInput = document.getElementById("admin-social-facebook") as HTMLInputElement | null;
  const socialInstagramInput = document.getElementById("admin-social-instagram") as HTMLInputElement | null;
  const settingsSaveBtn = document.getElementById("admin-settings-save") as HTMLButtonElement | null;
  const settingsResetBtn = document.getElementById("admin-settings-reset") as HTMLButtonElement | null;
  const env = (import.meta as unknown as { env: Record<string, string | undefined> }).env;
  if (soundIdsInput) {
    soundIdsInput.value =
      env.TTVM_TIKTOK_SOUND_IDS ??
      env.TIKTOK_SOUND_IDS ??
      "Set TTVM_TIKTOK_SOUND_IDS in .env";
  }
  const fillSettingsForm = (settings: AppSettings) => { 
    if (appNameInput) appNameInput.value = settings.appName; 
    if (appSubtitleInput) appSubtitleInput.value = settings.appSubtitle; 
    if (logoTextInput) logoTextInput.value = settings.logoText; 
    if (logoUrlInput) logoUrlInput.value = settings.logoUrl;
    if (footerTitleInput) footerTitleInput.value = settings.footerTitle; 
    if (footerSubtitleInput) footerSubtitleInput.value = settings.footerSubtitle; 
    if (copyrightTextInput) copyrightTextInput.value = settings.copyrightText;
    if (socialYoutubeInput) socialYoutubeInput.value = settings.socialYoutube;
    if (socialTiktokInput) socialTiktokInput.value = settings.socialTiktok;
    if (socialFacebookInput) socialFacebookInput.value = settings.socialFacebook;
    if (socialInstagramInput) socialInstagramInput.value = settings.socialInstagram;
  }; 
  const setSettingsAlert = (type: "success" | "error", message: string) => { 
    if (!settingsAlertEl) return; 
    settingsAlertEl.style.display = "block"; 
    settingsAlertEl.className = `admin-alert ${type}`; 
    settingsAlertEl.textContent = message; 
  }; 
  fillSettingsForm(DEFAULT_APP_SETTINGS);

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

  const loadAppSettings = async () => {
    const { data, error } = await client
      .from("tt_app_settings")
      .select(
        "app_name,app_subtitle,logo_text,logo_url,footer_title,footer_subtitle,copyright_text,social_youtube,social_tiktok,social_facebook,social_instagram",
      )
      .eq("id", 1)
      .maybeSingle();
    if (error) {
      setSettingsAlert("error", `Settings load failed: ${error.message}`);
      fillSettingsForm(DEFAULT_APP_SETTINGS);
      applyAppSettingsToLayout(DEFAULT_APP_SETTINGS);
      return DEFAULT_APP_SETTINGS;
    }
    const mapped = data
      ? toAppSettings({
          appName: data.app_name,
          appSubtitle: data.app_subtitle,
          logoText: data.logo_text,
          logoUrl: data.logo_url,
          footerTitle: data.footer_title,
          footerSubtitle: data.footer_subtitle,
          copyrightText: data.copyright_text,
          socialYoutube: data.social_youtube,
          socialTiktok: data.social_tiktok,
          socialFacebook: data.social_facebook,
          socialInstagram: data.social_instagram,
        })
      : DEFAULT_APP_SETTINGS;
    fillSettingsForm(mapped);
    applyAppSettingsToLayout(mapped);
    return mapped;
  };

  settingsSaveBtn?.addEventListener("click", async () => {
    const next = toAppSettings({
      appName: appNameInput?.value ?? "",
      appSubtitle: appSubtitleInput?.value ?? "",
      logoText: logoTextInput?.value ?? "",
      logoUrl: logoUrlInput?.value ?? "",
      footerTitle: footerTitleInput?.value ?? "",
      footerSubtitle: footerSubtitleInput?.value ?? "",
      copyrightText: copyrightTextInput?.value ?? "",
      socialYoutube: socialYoutubeInput?.value ?? "",
      socialTiktok: socialTiktokInput?.value ?? "",
      socialFacebook: socialFacebookInput?.value ?? "",
      socialInstagram: socialInstagramInput?.value ?? "",
    });
    const { error } = await client.from("tt_app_settings").upsert(
      {
        id: 1,
        app_name: next.appName,
        app_subtitle: next.appSubtitle,
        logo_text: next.logoText,
        logo_url: next.logoUrl,
        footer_title: next.footerTitle,
        footer_subtitle: next.footerSubtitle,
        copyright_text: next.copyrightText,
        social_youtube: next.socialYoutube,
        social_tiktok: next.socialTiktok,
        social_facebook: next.socialFacebook,
        social_instagram: next.socialInstagram,
      },
      { onConflict: "id" },
    );
    if (error) {
      setSettingsAlert("error", `Settings save failed: ${error.message}`);
      return;
    }
    fillSettingsForm(next);
    applyAppSettingsToLayout(next);
    setSettingsAlert("success", "Settings saved.");
  });

  settingsResetBtn?.addEventListener("click", async () => {
    const next = DEFAULT_APP_SETTINGS;
    const { error } = await client.from("tt_app_settings").upsert(
      {
        id: 1,
        app_name: next.appName,
        app_subtitle: next.appSubtitle,
        logo_text: next.logoText,
        logo_url: next.logoUrl,
        footer_title: next.footerTitle,
        footer_subtitle: next.footerSubtitle,
        copyright_text: next.copyrightText,
        social_youtube: next.socialYoutube,
        social_tiktok: next.socialTiktok,
        social_facebook: next.socialFacebook,
        social_instagram: next.socialInstagram,
      },
      { onConflict: "id" },
    );
    if (error) {
      setSettingsAlert("error", `Settings reset failed: ${error.message}`);
      return;
    }
    fillSettingsForm(next);
    applyAppSettingsToLayout(next);
    setSettingsAlert("success", "Settings reset to defaults.");
  });

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
    await loadAppSettings();
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
