export const renderFooter = () => `
  <footer class="footer">
    <div class="footer-inner">
      <div class="footer-brand">
        <p class="footer-title">VISA SOUND MONITOR</p>
        <p class="muted footer-subtitle">Live TikTok sound monitoring dashboard</p>
      </div>
      <div class="footer-links">
        <div class="footer-social">
          <a class="footer-social-link footer-social-youtube" style="display:none" target="_blank" rel="noreferrer">YouTube</a>
          <a class="footer-social-link footer-social-tiktok" style="display:none" target="_blank" rel="noreferrer">TikTok</a>
          <a class="footer-social-link footer-social-facebook" style="display:none" target="_blank" rel="noreferrer">Facebook</a>
          <a class="footer-social-link footer-social-instagram" style="display:none" target="_blank" rel="noreferrer">Instagram</a>
        </div>
        <p class="footer-meta">(c) ${new Date().getFullYear()} TikTok Visa Monitor</p>
      </div>
    </div>
  </footer>
`;
