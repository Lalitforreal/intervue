import type { ReplayPayload } from "../types";

export function getReplayPanel(): string {
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
                    font-family: -apple-system, BlinkMacSystemFont,
                        "SF Pro Display", "SF Pro Text",
                        "Segoe UI", sans-serif;

                    background: var(--vscode-editor-background);
                    color: var(--vscode-editor-foreground);
                }

                .container {
                    max-width: 1000px;
                    margin: 0 auto;
                    padding: 32px;
                }

                .header {
                    margin-bottom: 28px;
                }

                .eyebrow {
                    font-size: 12px;
                    font-weight: 600;
                    letter-spacing: 0.08em;
                    text-transform: uppercase;
                    color: var(--vscode-textLink-foreground);
                    margin-bottom: 8px;
                }

                h1 {
                    margin: 0;
                    font-size: 30px;
                }

                .state {
                    border: 1px solid var(--vscode-panel-border);
                    border-radius: 12px;
                    padding: 20px;
                    margin-bottom: 28px;
                    background: var(--vscode-editorWidget-background);
                }

                .state-title {
                    font-size: 16px;
                    font-weight: 600;
                    margin-bottom: 12px;
                }

                #code {
                    min-height: 280px;
                    margin: 0;
                    padding: 16px;
                    border-radius: 8px;
                    background: var(--vscode-textCodeBlock-background);

                    font-family: monospace;
                    font-size: 13px;
                    line-height: 1.6;

                    white-space: pre-wrap;
                    overflow-x: auto;
                }

                #language {
                    color: var(--vscode-descriptionForeground);
                }

                #problem-description {
                    color: var(--vscode-descriptionForeground);
                }

                #problem-constraints {
                    margin-top: 12px;
                    white-space: pre-wrap;
                }

                #problem-examples {
                    margin-top: 12px;
                    padding: 12px;

                    border-radius: 8px;
                    background: var(--vscode-textCodeBlock-background);

                    white-space: pre-wrap;
                    overflow-x: auto;
                }

                #cursor {
                    color: var(--vscode-descriptionForeground);
                    white-space: pre-line;
                }

                .timeline-container {
                    border: 1px solid var(--vscode-panel-border);
                    border-radius: 12px;
                    padding: 24px;
                    background: var(--vscode-editorWidget-background);
                }

                .timeline-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 16px;
                }

                .timeline-title {
                    font-size: 16px;
                    font-weight: 600;
                }

                #sequence {
                    color: var(--vscode-descriptionForeground);
                    font-size: 13px;
                }

                #timeline {
                    width: 100%;
                    cursor: pointer;
                }

                .timeline-labels {
                    display: flex;
                    justify-content: space-between;
                    margin-top: 8px;

                    font-size: 12px;
                    color: var(--vscode-descriptionForeground);
                }

            </style>
        </head>


        <body>

            <main class="container">

                <header class="header">
                    <div class="eyebrow">
                        Interview Replay
                    </div>

                    <h1>
                        Replay Session
                    </h1>
                </header>


                <!-- Code -->

                <section class="state">

                    <div class="state-title">
                        Code
                    </div>

                    <pre id="code">—</pre>

                </section>


                <!-- Language -->

                <section class="state">

                    <div class="state-title">
                        Language
                    </div>

                    <div id="language">
                        —
                    </div>

                </section>


                <!-- Problem -->

                <section class="state">

                    <div class="state-title">
                        Problem
                    </div>

                    <h2 id="problem-title">
                        —
                    </h2>

                    <p id="problem-description">
                        —
                    </p>

                    <div id="problem-constraints">
                    </div>

                    <pre id="problem-examples">
                    </pre>

                </section>


                <!-- Cursors -->

                <section class="state">

                    <div class="state-title">
                        Cursors
                    </div>

                    <div id="cursor">
                        —
                    </div>

                </section>


                <!-- Timeline -->

                <section class="timeline-container">

                    <div class="timeline-header">

                        <div class="timeline-title">
                            Timeline
                        </div>

                        <div id="sequence">
                            Sequence: 0
                        </div>

                    </div>


                    <input
                        id="timeline"
                        type="range"
                        min="0"
                        max="100"
                        value="100"
                    />


                    <div class="timeline-labels">

                        <span>
                            Start
                        </span>

                        <span>
                            End
                        </span>

                    </div>

                </section>

            </main>


            <script>

                const vscode = acquireVsCodeApi();

                const timeline = document.getElementById("timeline");
                const sequence = document.getElementById("sequence");


                // Tell extension that the Replay WebView is ready.

                vscode.postMessage({
                    type: "ready"
                });


                // Receive data from the extension.

                window.addEventListener("message", (event) => {

                    const message = event.data;


                    // -----------------------------------------
                    // MAX SEQUENCE
                    // -----------------------------------------

                    if (message.type === "max-sequence") {

                        const maxSequence = Number(message.payload);

                        timeline.min = 0;
                        timeline.max = maxSequence;

                        // Replay starts at the end
                        timeline.value = maxSequence;

                        sequence.textContent =
                            "Sequence: " + maxSequence;
                    }


                    // -----------------------------------------
                    // REPLAYED STATE
                    // -----------------------------------------

                    if (message.type === "replayed-state") {

                        const state = message.payload;

                        // CODE

                        if (state.code !== undefined) {

                            document.getElementById("code").textContent =
                                state.code;
                        }



                        // LANGUAGE


                        if (state.language !== undefined) {

                            document.getElementById("language").textContent =
                                state.language;
                        }

                        // PROBLEM

                        if (state.problem !== undefined) {

                            if (state.problem.title !== undefined) {

                                document.getElementById(
                                    "problem-title"
                                ).textContent =
                                    state.problem.title;
                            }


                            if (state.problem.description !== undefined) {

                                document.getElementById(
                                    "problem-description"
                                ).textContent =
                                    state.problem.description;
                            }


                            if (state.problem.constraints !== undefined) {

                                document.getElementById(
                                    "problem-constraints"
                                ).textContent =
                                    state.problem.constraints;
                            }


                            if (state.problem.examples !== undefined) {

                                document.getElementById(
                                    "problem-examples"
                                ).textContent =
                                    state.problem.examples;
                            }

                        }



                        // CURSOR

                        if (state.cursor !== undefined) {

                            const interviewer =
                                state.cursor.interviewer;

                            const guest =
                                state.cursor.guest;


                            document.getElementById(
                                "cursor"
                            ).textContent =

                                "Interviewer: " +
                                interviewer.line +
                                ":" +
                                interviewer.char +

                                " | Guest: " +
                                guest.line +
                                ":" +
                                guest.char;
                        }

                    }

                });


                // DEBOUNCE

                let debounceTimer;


                timeline.addEventListener("input", () => {

                    // Update UI immediately.

                    sequence.textContent =
                        "Sequence: " + timeline.value;


                    // Cancel previous timer.

                    clearTimeout(debounceTimer);


                    // Wait until interviewer stops moving slider.

                    debounceTimer = setTimeout(() => {

                        vscode.postMessage({

                            type: "sequence-change",

                            sequence: Number(
                                timeline.value
                            )

                        });

                    }, 700);

                });

            </script>

        </body>

        </html>
    `;
}