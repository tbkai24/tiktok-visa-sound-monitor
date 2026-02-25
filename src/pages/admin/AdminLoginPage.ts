import { supabase, supabaseConfigError } from "../../lib/supabase";

const escapeHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

export const renderAdminLoginPage = (root: HTMLDivElement) => {
  root.innerHTML = `
    <div class="auth-wrap">
      <article class="glass-card auth-card">
        <h2>Admin Login</h2>
        <p class="muted">Use your Supabase admin account credentials.</p>
        <form id="admin-login-form" class="auth-form">
          <label>
            <span>Email</span>
            <input id="admin-email" type="email" required autocomplete="email" />
          </label>
          <label>
            <span>Password</span>
            <input id="admin-password" type="password" required autocomplete="current-password" />
          </label>
          <p id="admin-login-error" class="down"></p>
          <div class="auth-actions">
            <button id="admin-signin" type="submit" class="small-btn">Sign In</button>
            <a class="admin-entry-link" href="/">Back to Dashboard</a>
          </div>
        </form>
      </article>
    </div>
  `;

  const form = document.getElementById("admin-login-form") as HTMLFormElement | null;
  const emailInput = document.getElementById("admin-email") as HTMLInputElement | null;
  const passwordInput = document.getElementById("admin-password") as HTMLInputElement | null;
  const errorEl = document.getElementById("admin-login-error");
  const submitBtn = document.getElementById("admin-signin") as HTMLButtonElement | null;
  if (!form || !emailInput || !passwordInput || !errorEl || !submitBtn) {
    return;
  }

  if (!supabase) {
    errorEl.innerHTML = escapeHtml(supabaseConfigError ?? "Supabase is not configured.");
    submitBtn.disabled = true;
    return;
  }
  const client = supabase;

  void client.auth.getSession().then(({ data }) => {
    if (data.session) {
      window.location.replace("/admin");
    }
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    errorEl.textContent = "";
    submitBtn.disabled = true;
    submitBtn.textContent = "Signing in...";

    const { error } = await client.auth.signInWithPassword({
      email: emailInput.value.trim(),
      password: passwordInput.value,
    });

    if (error) {
      errorEl.textContent = error.message;
      submitBtn.disabled = false;
      submitBtn.textContent = "Sign In";
      return;
    }

    window.location.replace("/admin");
  });
};
