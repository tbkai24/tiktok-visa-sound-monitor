import { renderAdminLoginPage } from "./pages/admin/AdminLoginPage";
import { renderAdminPage } from "./pages/admin/AdminPage";
import { renderHomePage } from "./pages/public/HomePage";

export const renderApp = (root: HTMLDivElement) => {
  const path = window.location.pathname.replace(/\/+$/, "") || "/";

  if (path === "/admin/login") {
    renderAdminLoginPage(root);
    return;
  }

  if (path === "/admin") {
    renderAdminPage(root);
    return;
  }

  renderHomePage(root);
};

