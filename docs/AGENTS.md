# Writing Docs

- Write each doc for the question its reader brings:
  - architecture.md, extension-runtime.md, data-and-sync.md, and concepts/ are explanations. They answer how the application works, such as what each part is responsible for, how data and messages flow between parts, and why a design solves its problem, so a reader can follow them without the code open. They do not inventory component trees, function names, or file lists, which the code already shows and which churn with every refactor.
  - references.md is a reference. It answers which outside projects are useful for what.
  - ai-integration.md, generate-import-json.md, e2e.md, deployment.md, and chrome-store-submissions.md are guides. They answer what to do, including what to run when a command rejects something.
- Use Title Case for headings. In explanations, phrase each section heading as the action the section explains, such as "Route Background Calls Through a YouTube Tab", and keep plain labels for lists such as "References".
- Draw diagrams as SVG files in `images/` next to the doc. Give the SVG its own white background, so it reads the same in GitHub's light and dark themes.
