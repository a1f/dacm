import { invoke } from "@tauri-apps/api/core";
import "./style.css";

const app = document.querySelector<HTMLDivElement>("#app")!;

app.innerHTML = `
  <h1>DACM</h1>
  <div class="buttons">
    <button id="btn1">Button 1</button>
    <button id="btn2">Button 2</button>
  </div>
  <p id="status"></p>
`;

const status = document.querySelector<HTMLParagraphElement>("#status")!;

async function handleClick(button: string) {
  try {
    await invoke("log_button_press", { button });
    status.textContent = `${button} pressed`;
  } catch (e) {
    status.textContent = `Error: ${e}`;
  }
}

document.querySelector("#btn1")!.addEventListener("click", () => handleClick("Button 1"));
document.querySelector("#btn2")!.addEventListener("click", () => handleClick("Button 2"));
