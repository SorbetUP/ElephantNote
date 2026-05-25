import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles/globals.css";
import vditorIconsSvg from "./assets/vditor-icons.svg?raw";
import { ensureVditorIconsInjected } from "./lib/vditorIcons";

ensureVditorIconsInjected(vditorIconsSvg);

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <App />
);
