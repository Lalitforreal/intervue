export function getSessionEndedWebviewContent(): string {
    return `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">

            <style>
                :root {
                    color-scheme: light dark;
                }

                * {
                    box-sizing: border-box;
                }

                body {
                    margin: 0;
                    min-height: 100vh;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-family: -apple-system, BlinkMacSystemFont,
                        "SF Pro Display", "SF Pro Text",
                        "Segoe UI", sans-serif;
                    background: var(--vscode-editor-background);
                    color: var(--vscode-editor-foreground);
                }

                .container {
                    width: 100%;
                    max-width: 520px;
                    padding: 48px 32px;
                    text-align: center;
                }

                .icon {
                    width: 64px;
                    height: 64px;
                    margin: 0 auto 24px;
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    background: var(--vscode-editorWidget-background);
                    border: 1px solid var(--vscode-panel-border);
                    font-size: 28px;
                }

                h1 {
                    margin: 0;
                    font-size: 30px;
                    line-height: 1.2;
                }

                p {
                    margin: 14px 0 30px;
                    font-size: 15px;
                    line-height: 1.6;
                    color: var(--vscode-descriptionForeground);
                }

                button {
                    border: none;
                    border-radius: 8px;
                    padding: 10px 22px;
                    font-size: 14px;
                    font-weight: 600;
                    cursor: pointer;
                    color: var(--vscode-button-foreground);
                    background: var(--vscode-button-background);
                }

                button:hover {
                    background: var(--vscode-button-hoverBackground);
                }
            </style>
        </head>

        <body>
            <main class="container">
                <div class="icon">✓</div>

                <h1>Interview Ended</h1>

                <p>
                    The interview session has ended.
                    You can now replay the session and review what happened.
                </p>

                <button id="replayButton">
                    Replay Interview
                </button>
            </main>

            <script>
                const vscode = acquireVsCodeApi();

                document
                    .getElementById("replayButton")
                    .addEventListener("click", () => {
                        vscode.postMessage({
                            type: "replay"
                        });
                    });
            </script>
        </body>
        </html>
    `;
}