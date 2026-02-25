import "./style.css";
import { renderApp } from "./router";

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) {
  throw new Error("App root not found");
}

renderApp(app);
