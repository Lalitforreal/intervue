export function getGuestProblemWebviewContent(): string {
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
					padding: 0;
					font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display",
						"SF Pro Text", "Segoe UI", sans-serif;
					background: var(--vscode-editor-background);
					color: var(--vscode-editor-foreground);
				}

				.container {
					max-width: 820px;
					margin: 0 auto;
					padding: 48px 32px 64px;
				}

				.header {
					margin-bottom: 36px;
				}

				.eyebrow {
					font-size: 13px;
					font-weight: 600;
					letter-spacing: 0.08em;
					text-transform: uppercase;
					color: var(--vscode-textLink-foreground);
					margin-bottom: 10px;
				}

				.title {
					margin: 0;
					font-size: 34px;
					line-height: 1.15;
					font-weight: 700;
					letter-spacing: -0.025em;
				}

				.description {
					margin-top: 16px;
					font-size: 16px;
					line-height: 1.65;
					color: var(--vscode-descriptionForeground);
					white-space: pre-wrap;
				}

				.section {
					margin-top: 32px;
				}

				.section-title {
					font-size: 18px;
					font-weight: 650;
					margin-bottom: 14px;
					letter-spacing: -0.01em;
				}

				.card {
					padding: 20px 22px;
					border: 1px solid var(--vscode-panel-border);
					border-radius: 14px;
					background: var(--vscode-editorWidget-background);
				}

				.constraints {
					margin: 0;
					padding-left: 22px;
					line-height: 1.7;
				}

				.example {
					margin-bottom: 16px;
				}

				.example:last-child {
					margin-bottom: 0;
				}

				.example-label {
					font-size: 13px;
					font-weight: 600;
					color: var(--vscode-descriptionForeground);
					margin-bottom: 8px;
				}

				pre {
					margin: 0;
					padding: 16px;
					border-radius: 10px;
					background: var(--vscode-textCodeBlock-background);
					font-family: "SFMono-Regular", Consolas, "Liberation Mono",
						monospace;
					font-size: 13px;
					line-height: 1.6;
					white-space: pre-wrap;
					overflow-x: auto;
				}

				.empty {
					text-align: center;
					padding: 80px 20px;
					color: var(--vscode-descriptionForeground);
				}

				.empty-title {
					font-size: 22px;
					font-weight: 600;
					margin-bottom: 8px;
					color: var(--vscode-editor-foreground);
				}

				.empty-description {
					font-size: 14px;
				}
			</style>
		</head>

		<body>
			<div id="app"></div>

			<script>
				const vscode = acquireVsCodeApi();

				const app = document.getElementById("app");

                window.addEventListener("message", (event) => {
                    const message = event.data;
                    if (message.type === "problem-updated") {
                        renderProblem(message.payload);
						}
						});
						
						vscode.postMessage({
							type: "ready"
						});
				function renderProblem(problem) {
					app.innerHTML = "";

					const container = document.createElement("main");
					container.className = "container";

					const header = document.createElement("header");
					header.className = "header";

					const eyebrow = document.createElement("div");
					eyebrow.className = "eyebrow";
					eyebrow.textContent = "Technical Interview";

					const title = document.createElement("h1");
					title.className = "title";
					title.textContent = problem.title;

					const description = document.createElement("div");
					description.className = "description";
					description.textContent = problem.description;

					header.appendChild(eyebrow);
					header.appendChild(title);
					header.appendChild(description);

					container.appendChild(header);

					if (problem.constraints) {
						const section = document.createElement("section");
						section.className = "section";

						const heading = document.createElement("h2");
						heading.className = "section-title";
						heading.textContent = "Constraints";

						const card = document.createElement("div");
						card.className = "card";

						const constraints = document.createElement("div");
						constraints.className = "constraints";
						constraints.textContent = problem.constraints;

						card.appendChild(constraints);
						section.appendChild(heading);
						section.appendChild(card);
						container.appendChild(section);
					}

					if (problem.examples) {
						const section = document.createElement("section");
						section.className = "section";

						const heading = document.createElement("h2");
						heading.className = "section-title";
						heading.textContent = "Examples";

						const card = document.createElement("div");
						card.className = "card";

						const example = document.createElement("pre");
						example.textContent = problem.examples;

						card.appendChild(example);
						section.appendChild(heading);
						section.appendChild(card);
						container.appendChild(section);
					}

					app.appendChild(container);
				}

				function showEmptyState() {
					app.innerHTML = \`
						<div class="empty">
							<div class="empty-title">No problem selected</div>
							<div class="empty-description">
								Your interviewer hasn't set a problem yet.
							</div>
						</div>
					\`;
				}



				showEmptyState();
			</script>
		</body>
		</html>
	`;
}