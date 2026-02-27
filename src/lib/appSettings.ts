export type AppSettings = {
  appName: string;
  appSubtitle: string;
  logoText: string;
  logoUrl: string;
  footerTitle: string;
  footerSubtitle: string;
  copyrightText: string;
  socialYoutube: string;
  socialTiktok: string;
  socialFacebook: string;
  socialInstagram: string;
};

export const DEFAULT_APP_SETTINGS: AppSettings = {
  appName: "VISA SOUND MONITOR",
  appSubtitle: "TikTok Tracking Dashboard",
  logoText: "V",
  logoUrl: "",
  footerTitle: "VISA SOUND MONITOR",
  footerSubtitle: "Live TikTok sound monitoring dashboard",
  copyrightText: "TikTok Visa Monitor",
  socialYoutube: "",
  socialTiktok: "",
  socialFacebook: "",
  socialInstagram: "",
};

const trimOrDefault = (value: unknown, fallback: string) => {
  const text = typeof value === "string" ? value.trim() : "";
  return text || fallback;
};

const normalize = (value: Partial<AppSettings> | null | undefined): AppSettings => ({
  appName: trimOrDefault(value?.appName, DEFAULT_APP_SETTINGS.appName),
  appSubtitle: trimOrDefault(value?.appSubtitle, DEFAULT_APP_SETTINGS.appSubtitle),
  logoText: trimOrDefault(value?.logoText, DEFAULT_APP_SETTINGS.logoText).slice(0, 2),
  logoUrl: typeof value?.logoUrl === "string" ? value.logoUrl.trim() : "",
  footerTitle: trimOrDefault(value?.footerTitle, DEFAULT_APP_SETTINGS.footerTitle),
  footerSubtitle: trimOrDefault(value?.footerSubtitle, DEFAULT_APP_SETTINGS.footerSubtitle),
  copyrightText: trimOrDefault(value?.copyrightText, DEFAULT_APP_SETTINGS.copyrightText),
  socialYoutube: typeof value?.socialYoutube === "string" ? value.socialYoutube.trim() : "",
  socialTiktok: typeof value?.socialTiktok === "string" ? value.socialTiktok.trim() : "",
  socialFacebook: typeof value?.socialFacebook === "string" ? value.socialFacebook.trim() : "",
  socialInstagram: typeof value?.socialInstagram === "string" ? value.socialInstagram.trim() : "",
});

export const toAppSettings = (value: Partial<AppSettings> | null | undefined): AppSettings =>
  normalize(value);

export const applyAppSettingsToLayout = (value: Partial<AppSettings> | null | undefined) => {
  const settings = normalize(value);
  const logoEl = document.querySelector<HTMLElement>(".brand-dot");
  const titleEl = document.querySelector<HTMLElement>(".brand-title");
  const subtitleEl = document.querySelector<HTMLElement>(".brand-subtitle");
  const footerTitleEl = document.querySelector<HTMLElement>(".footer-title");
  const footerSubtitleEl = document.querySelector<HTMLElement>(".footer-subtitle");
  const footerMetaEl = document.querySelector<HTMLElement>(".footer-meta");
  const socialYoutubeEl = document.querySelector<HTMLAnchorElement>(".footer-social-youtube");
  const socialTiktokEl = document.querySelector<HTMLAnchorElement>(".footer-social-tiktok");
  const socialFacebookEl = document.querySelector<HTMLAnchorElement>(".footer-social-facebook");
  const socialInstagramEl = document.querySelector<HTMLAnchorElement>(".footer-social-instagram");

  if (logoEl) {
    if (settings.logoUrl) {
      logoEl.innerHTML = `<img src="${settings.logoUrl.replaceAll('"', "&quot;")}" alt="logo" class="brand-logo-img" />`;
    } else {
      logoEl.textContent = settings.logoText;
    }
  }
  if (titleEl) titleEl.textContent = settings.appName;
  if (subtitleEl) subtitleEl.textContent = settings.appSubtitle;
  if (footerTitleEl) footerTitleEl.textContent = settings.footerTitle;
  if (footerSubtitleEl) footerSubtitleEl.textContent = settings.footerSubtitle;
  if (footerMetaEl) footerMetaEl.textContent = `(c) ${new Date().getFullYear()} ${settings.copyrightText}`;

  const setSocial = (anchor: HTMLAnchorElement | null, href: string) => {
    if (!anchor) return;
    if (href) {
      anchor.href = href;
      anchor.style.display = "";
    } else {
      anchor.removeAttribute("href");
      anchor.style.display = "none";
    }
  };

  setSocial(socialYoutubeEl, settings.socialYoutube);
  setSocial(socialTiktokEl, settings.socialTiktok);
  setSocial(socialFacebookEl, settings.socialFacebook);
  setSocial(socialInstagramEl, settings.socialInstagram);
};
