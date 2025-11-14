# Code

- Prefer declarative, self-documenting code
- Prefer precise and verbose symbol naming over comments
- Omit comments and docblock descriptions when the symbol name is self-describing
- Keep only metadata tags (e.g., `@see`, `@throws`) in docblocks when needed, without descriptive headings

# Process

- Never commit to the `main` branch
- Always work on a feature branch, committing atomically as you iterate
- Always ensure test pass after tasks are complete

# Node/NPM

- Before running any npm or node commands, ensure you are using the correct versions, which should be loaded by NVM, specified via .nvmrc.
- Run tests with `npm run test`
- Lint code with `npm run lint`
- Generate types with `npm run types`
- Keep packages up to date when possible
