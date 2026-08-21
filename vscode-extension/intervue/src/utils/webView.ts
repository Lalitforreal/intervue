export function getWebviewContent(): string {
    return `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Problem Set</title>
        </head>

        <body>
            <h1>Set Problem</h1>

            <form id="problem-form">
                <label for="title">Title</label>
                <input id="title" name="title" type="text" required />

                <label for="description">Description</label>
                <textarea id="description" name="description" required></textarea>

                <label for="constraints">Constraints</label>
                <textarea id="constraints" name="constraints"></textarea>

                <label for="examples">Examples</label>
                <textarea id="examples" name="examples"></textarea>

                <button type="submit">Set Problem</button>
            </form>

            <script>
                const vscode = acquireVsCodeApi();

                document.getElementById("problem-form").addEventListener("submit", (event) => {
                    event.preventDefault();

                    const payload = {
                        title: document.getElementById("title").value,
                        description: document.getElementById("description").value,
                        constraints: document.getElementById("constraints").value,
                        examples: document.getElementById("examples").value
                    };

                    vscode.postMessage({
                        type: "submit",
                        payload
                    });
                });
            </script>
        </body>
        </html>
    `;
}